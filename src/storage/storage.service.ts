import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
const Jimp = require('jimp')
const ffmpeg = require('fluent-ffmpeg')

config()

@Injectable()
export class StorageService {
	private readonly s3: S3Client
	private readonly bucketName: string
	private readonly logger = new Logger(StorageService.name)

	constructor() {
		this.s3 = new S3Client({
			region: process.env.AWS_REGION,
			endpoint: process.env.AWS_HOST,
			credentials: {
				accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
				secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
			},
		})
		this.bucketName = process.env.AWS_BUCKET_NAME!
	}

	async uploadPhoto(photo: Express.Multer.File): Promise<string> {
		if (!photo || !photo.buffer) {
			throw new BadRequestException('Файл не найден или повреждён')
		}

		const key = `user_photos/${randomUUID()}-${photo.originalname}`

		try {
			const command = new PutObjectCommand({
				Bucket: this.bucketName,
				Key: key,
				Body: photo.buffer,
				ContentType: photo.mimetype,
				ContentLength: photo.size,
			})

			await this.s3.send(command)
			return key
		} catch (error) {
			this.logger.error(`Ошибка при загрузке фото в хранилище: ${error}`)
			throw new BadRequestException(
				'Не удалось загрузить фото. Пожалуйста, попробуйте снова.'
			)
		}
	}

	async uploadVideo(video: Express.Multer.File): Promise<string> {
		if (!video || !video.buffer) {
			throw new BadRequestException('Видеофайл не найден или повреждён')
		}

		// Проверяем размер файла (максимум 100MB)
		const maxSize = 100 * 1024 * 1024 
		if (video.size > maxSize) {
			throw new BadRequestException(
				'Размер видеофайла не должен превышать 100MB'
			)
		}

		// Поддерживаемые входные форматы для конвертации
		const supportedInputTypes = [
			'video/mp4',
			'video/webm',
			'video/ogg',
			'video/ogv',
			'video/avi',
			'video/mov',
			'video/wmv',
			'video/3gpp',
			'video/x-flv',
			'video/x-ms-wmv',
			'video/quicktime',
		]

		const supportedInputExtensions = [
			'.mp4',
			'.webm',
			'.ogg',
			'.ogv',
			'.avi',
			'.mov',
			'.wmv',
			'.3gp',
			'.flv',
			'.asf',
		]

		const fileExtension = path.extname(video.originalname).toLowerCase()
		const isSupportedInput =
			supportedInputTypes.includes(video.mimetype) ||
			supportedInputExtensions.includes(fileExtension)

		if (!isSupportedInput) {
			throw new BadRequestException(
				'Неподдерживаемый формат видео. Разрешены: MP4, WebM, AVI, MOV, WMV, 3GP, FLV, ASF'
			)
		}

		// Проверяем, нужна ли конвертация в MP4
		const needsConversion =
			video.mimetype !== 'video/mp4' && fileExtension !== '.mp4'

		const key = `psychologist_videos/${randomUUID()}-${video.originalname}`

		try {
			let finalBuffer = video.buffer
			let finalContentType = 'video/mp4'
			let finalSize = video.size

			// Если нужна конвертация, конвертируем в MP4
			if (needsConversion) {
				this.logger.log(`Конвертация видео в MP4: ${video.originalname}`)
				const convertedBuffer = await this.convertVideoToMp4(
					video.buffer,
					video.originalname
				)
				finalBuffer = convertedBuffer
				finalSize = convertedBuffer.length
				this.logger.log(
					`Видео сконвертировано, новый размер: ${finalSize} байт`
				)
			}

			const command = new PutObjectCommand({
				Bucket: this.bucketName,
				Key: key,
				Body: finalBuffer,
				ContentType: finalContentType,
				ContentLength: finalSize,
			})

			await this.s3.send(command)
			this.logger.log(`Видео успешно загружено: ${key}`)
			return key
		} catch (error) {
			this.logger.error(`Ошибка при загрузке видео в хранилище: ${error}`)
			throw new BadRequestException(
				'Не удалось загрузить видео. Пожалуйста, попробуйте снова.'
			)
		}
	}

	/**
	 * Конвертация видео в MP4 формат
	 */
	private async convertVideoToMp4(
		videoBuffer: Buffer,
		originalName: string
	): Promise<Buffer> {
		const tempDir = '/tmp'
		const inputPath = path.join(
			tempDir,
			`input_${randomUUID()}${path.extname(originalName)}`
		)
		const outputPath = path.join(tempDir, `output_${randomUUID()}.mp4`)

		try {
			// Сохраняем входной файл
			fs.writeFileSync(inputPath, videoBuffer)
			this.logger.log(`Входной файл сохранен: ${inputPath}`)

			// Конвертируем с помощью FFmpeg
			await this.convertWithFFmpeg(inputPath, outputPath)

			// Читаем результат
			const convertedBuffer = fs.readFileSync(outputPath)
			this.logger.log(
				`Конвертация завершена, размер: ${convertedBuffer.length} байт`
			)

			return convertedBuffer
		} catch (error) {
			this.logger.error(`Ошибка при конвертации видео: ${error}`)
			throw new BadRequestException(
				'Не удалось конвертировать видео в MP4 формат'
			)
		} finally {
			// Очищаем временные файлы
			this.cleanupTempFiles([inputPath, outputPath])
		}
	}

	/**
	 * Конвертация с помощью FFmpeg
	 */
	private async convertWithFFmpeg(
		inputPath: string,
		outputPath: string
	): Promise<void> {
		return new Promise((resolve, reject) => {
			ffmpeg(inputPath)
				.output(outputPath)
				.videoCodec('libx264') // H.264 кодек для максимальной совместимости
				.audioCodec('aac') // AAC аудио кодек
				.format('mp4')
				.videoBitrate('1000k') // Оптимальный битрейт для веба
				.audioBitrate('128k')
				.size('1280x720') // Максимальное разрешение для веба
				.fps(30) // 30 FPS для плавности
				.on('start', (commandLine: string) => {
					this.logger.log(`FFmpeg команда: ${commandLine}`)
				})
				.on('progress', (progress: any) => {
					this.logger.log(`Прогресс конвертации: ${progress.percent}%`)
				})
				.on('end', () => {
					this.logger.log('Конвертация завершена успешно')
					resolve()
				})
				.on('error', (err: Error) => {
					this.logger.error(`Ошибка FFmpeg: ${err.message}`)
					reject(err)
				})
				.run()
		})
	}

	/**
	 * Создание превью для видео
	 */
	async createVideoPreview(videoKey: string): Promise<string | null> {
		try {
			// Создаем ключ для превью
			const previewKey = videoKey
				.replace('.mp4', '_preview.jpg')
				.replace('.avi', '_preview.jpg')
				.replace('.mov', '_preview.jpg')
				.replace('.wmv', '_preview.jpg')
				.replace('.webm', '_preview.jpg')

			this.logger.log(`Создание превью для видео: ${videoKey} -> ${previewKey}`)

			// Создаем временные файлы
			const tempDir = '/tmp'
			const tempVideoPath = path.join(tempDir, `temp_${randomUUID()}.mp4`)
			const tempPreviewPath = path.join(tempDir, `preview_${randomUUID()}.jpg`)

			try {
				// Скачиваем видео из S3 во временный файл
				this.logger.log(`Скачивание видео из S3: ${videoKey}`)
				const videoBuffer = await this.downloadVideoFromS3(videoKey)
				this.logger.log(`Видео скачано, размер: ${videoBuffer.length} байт`)

				fs.writeFileSync(tempVideoPath, videoBuffer)
				this.logger.log(`Видео сохранено во временный файл: ${tempVideoPath}`)

				// Создаем превью с помощью ffmpeg
				this.logger.log(
					`Создание превью с помощью ffmpeg: ${tempVideoPath} -> ${tempPreviewPath}`
				)
				await this.extractVideoFrame(tempVideoPath, tempPreviewPath)

				// Проверяем, что превью создалось
				if (!fs.existsSync(tempPreviewPath)) {
					this.logger.warn(`Превью не было создано для видео ${videoKey}`)
					return null
				}

				this.logger.log(
					`Превью создано, размер: ${fs.statSync(tempPreviewPath).size} байт`
				)

				// Загружаем превью в S3
				this.logger.log(`Загрузка превью в S3: ${previewKey}`)
				const previewBuffer = fs.readFileSync(tempPreviewPath)
				await this.uploadPreviewToS3(previewKey, previewBuffer)

				this.logger.log(`Превью успешно создано: ${previewKey}`)
				return previewKey
			} finally {
				// Удаляем временные файлы
				this.cleanupTempFiles([tempVideoPath, tempPreviewPath])
			}
		} catch (error) {
			this.logger.error(
				`Ошибка при создании превью для видео ${videoKey}: ${error}`
			)
			return null
		}
	}

	/**
	 * Скачивание видео из S3
	 */
	private async downloadVideoFromS3(videoKey: string): Promise<Buffer> {
		try {
			const command = new GetObjectCommand({
				Bucket: this.bucketName,
				Key: videoKey,
			})

			const response = await this.s3.send(command)

			if (!response.Body) {
				throw new Error('Тело ответа пусто')
			}

			const chunks: Uint8Array[] = []
			const streamReader = response.Body as any

			for await (const chunk of streamReader) {
				chunks.push(chunk)
			}

			return Buffer.concat(chunks)
		} catch (error) {
			this.logger.error(`Ошибка при скачивании видео ${videoKey}: ${error}`)
			throw error
		}
	}

	/**
	 * Извлечение кадра из видео с помощью ffmpeg
	 */
	private async extractVideoFrame(
		videoPath: string,
		outputPath: string
	): Promise<void> {
		return new Promise((resolve, reject) => {
			// Сначала получаем информацию о видео
			ffmpeg.ffprobe(videoPath, (err: any, metadata: any) => {
				if (err) {
					this.logger.error(`Ошибка получения метаданных видео: ${err.message}`)
					reject(err)
					return
				}

				const duration = metadata.format.duration || 0
				this.logger.log(`Длительность видео: ${duration} секунд`)

				// Пытаемся найти первый не-черный кадр
				this.findFirstNonBlackFrame(videoPath, outputPath, duration)
					.then(() => resolve())
					.catch(reject)
			})
		})
	}

	/**
	 * Поиск первого не-черного кадра
	 */
	private async findFirstNonBlackFrame(
		videoPath: string,
		outputPath: string,
		duration: number
	): Promise<void> {
		const step = Math.max(0.5, duration / 10) // Шаг как на клиенте
		let currentTime = Math.min(1, duration / 10) // Начинаем с 1 секунды или 10% от длительности

		this.logger.log(
			`Поиск первого не-черного кадра, начиная с ${currentTime} секунд`
		)

		while (currentTime <= duration) {
			try {
				await this.extractFrameAtTime(videoPath, outputPath, currentTime)

				// Проверяем, не черный ли кадр
				const isBlack = await this.isFrameBlack(outputPath)

				if (!isBlack) {
					this.logger.log(`Найден не-черный кадр на ${currentTime} секунде`)
					return
				}

				this.logger.log(
					`Кадр на ${currentTime} секунде черный, пробуем следующий`
				)
				currentTime += step
			} catch (error) {
				this.logger.warn(
					`Ошибка при извлечении кадра на ${currentTime} секунде: ${error}`
				)
				currentTime += step
			}
		}

		// Если не нашли не-черный кадр, берем первый кадр
		this.logger.log('Не удалось найти не-черный кадр, используем первый кадр')
		await this.extractFrameAtTime(videoPath, outputPath, 0)
	}

	/**
	 * Извлечение кадра в определенное время
	 */
	private async extractFrameAtTime(
		videoPath: string,
		outputPath: string,
		time: number
	): Promise<void> {
		return new Promise((resolve, reject) => {
			ffmpeg(videoPath)
				.screenshots({
					timestamps: [time.toString()],
					filename: path.basename(outputPath),
					folder: path.dirname(outputPath),
					size: '960x720',
				})
				.on('end', () => resolve())
				.on('error', (err: Error) => reject(err))
		})
	}

	/**
	 * Проверка, является ли кадр черным
	 */
	private async isFrameBlack(imagePath: string): Promise<boolean> {
		try {
			// Читаем изображение с помощью Jimp
			const image = await Jimp.read(imagePath)

			// Получаем размеры изображения
			const width = image.getWidth()
			const height = image.getHeight()

			// Проверяем несколько случайных пикселей
			const sampleSize = Math.min(100, (width * height) / 100) // Проверяем 1% пикселей или максимум 100
			let blackPixels = 0
			let totalPixels = 0

			// Проверяем пиксели в сетке
			const stepX = Math.max(1, Math.floor(width / 10))
			const stepY = Math.max(1, Math.floor(height / 10))

			for (let x = 0; x < width; x += stepX) {
				for (let y = 0; y < height; y += stepY) {
					const color = Jimp.intToRGBA(image.getPixelColor(x, y))

					// Считаем пиксель черным, если все RGB компоненты меньше 30
					const isBlack = color.r < 30 && color.g < 30 && color.b < 30

					if (isBlack) {
						blackPixels++
					}
					totalPixels++
				}
			}

			// Если более 80% пикселей черные, считаем кадр черным
			const blackRatio = blackPixels / totalPixels
			const isBlack = blackRatio > 0.8

			this.logger.log(
				`Анализ кадра: ${blackPixels}/${totalPixels} черных пикселей (${(blackRatio * 100).toFixed(1)}%), черный: ${isBlack}`
			)

			return isBlack
		} catch (error) {
			this.logger.warn(`Ошибка при анализе кадра: ${error}`)
			// В случае ошибки считаем кадр не черным
			return false
		}
	}

	/**
	 * Загрузка превью в S3
	 */
	private async uploadPreviewToS3(
		previewKey: string,
		previewBuffer: Buffer
	): Promise<void> {
		try {
			const command = new PutObjectCommand({
				Bucket: this.bucketName,
				Key: previewKey,
				Body: previewBuffer,
				ContentType: 'image/jpeg',
				ContentLength: previewBuffer.length,
			})

			await this.s3.send(command)
			this.logger.log(`Превью загружено в S3: ${previewKey}`)
		} catch (error) {
			this.logger.error(`Ошибка при загрузке превью в S3: ${error}`)
			throw error
		}
	}

	/**
	 * Очистка временных файлов
	 */
	private cleanupTempFiles(filePaths: string[]): void {
		filePaths.forEach(filePath => {
			try {
				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath)
					this.logger.debug(`Временный файл удален: ${filePath}`)
				}
			} catch (error) {
				this.logger.warn(
					`Не удалось удалить временный файл ${filePath}: ${error}`
				)
			}
		})
	}

	/**
	 * Удаление видео из облака
	 */
	async deleteVideo(key: string): Promise<void> {
		try {
			const command = new DeleteObjectCommand({
				Bucket: this.bucketName,
				Key: key,
			})

			await this.s3.send(command)
			this.logger.log(`Видео успешно удалено: ${key}`)
		} catch (error) {
			this.logger.error(`Ошибка при удалении видео из хранилища: ${error}`)
			throw new BadRequestException('Не удалось удалить видео из хранилища')
		}
	}

	/**
	 * Загрузка архива чата в облачное хранилище
	 */
	async uploadChatArchive(key: string, data: Buffer): Promise<string> {
		try {
			const command = new PutObjectCommand({
				Bucket: this.bucketName,
				Key: key,
				Body: data,
				ContentType: 'application/json',
				ContentLength: data.length,
			})

			await this.s3.send(command)
			this.logger.log(`Успешно загружен архив чата: ${key}`)
			return key
		} catch (error) {
			this.logger.error(`Ошибка при загрузке архива чата: ${error}`)
			throw new BadRequestException('Не удалось сохранить архив чата')
		}
	}

	async getPresignedUrl(
		key: string,
		expiresIn: number = 3600
	): Promise<string> {
		try {
			const command = new GetObjectCommand({
				Bucket: this.bucketName,
				Key: key,
			})

			return await getSignedUrl(this.s3, command, { expiresIn })
		} catch (error) {
			this.logger.error(`Ошибка при получении URL для ${key}: ${error}`)
			throw new BadRequestException('Не удалось получить ссылку на файл')
		}
	}

	/**
	 * Получение архива чата из хранилища
	 */
	async getChatArchive(key: string): Promise<Buffer> {
		try {
			const command = new GetObjectCommand({
				Bucket: this.bucketName,
				Key: key,
			})

			const response = await this.s3.send(command)

			// Преобразование stream в buffer
			if (!response.Body) {
				throw new BadRequestException('Тело ответа пусто')
			}

			const chunks: Uint8Array[] = []
			const streamReader = response.Body as any

			for await (const chunk of streamReader) {
				chunks.push(chunk)
			}

			return Buffer.concat(chunks)
		} catch (error) {
			this.logger.error(`Ошибка при получении архива чата ${key}: ${error}`)
			throw new BadRequestException('Не удалось получить архив чата')
		}
	}

	async deletePhoto(key: string): Promise<void> {
		try {
			const command = new DeleteObjectCommand({
				Bucket: this.bucketName,
				Key: key,
			})

			await this.s3.send(command)
		} catch (error) {
			this.logger.error(`Ошибка при удалении файла ${key}: ${error}`)
			throw new BadRequestException('Не удалось удалить файл')
		}
	}

	async updatePhoto(
		oldKey: string,
		newPhoto: Express.Multer.File
	): Promise<string> {
		try {
			await this.deletePhoto(oldKey)
			return this.uploadPhoto(newPhoto)
		} catch (error) {
			this.logger.error(`Ошибка при обновлении фото ${oldKey}: ${error}`)
			throw new BadRequestException('Не удалось обновить фото')
		}
	}

	/**
	 * Проверка существования файла в хранилище
	 */
	async checkFileExists(key: string): Promise<boolean> {
		try {
			const command = new GetObjectCommand({
				Bucket: this.bucketName,
				Key: key,
			})

			await this.s3.send(command)
			return true
		} catch (error) {
			return false
		}
	}

	/**
	 * Загрузка медиафайла из чата в облачное хранилище
	 */
	async uploadChatMedia(file: Express.Multer.File): Promise<string> {
		if (!file || !file.buffer) {
			throw new BadRequestException('Файл не найден или повреждён')
		}

		const key = `chat_media/${randomUUID()}-${file.originalname}`

		try {
			const command = new PutObjectCommand({
				Bucket: this.bucketName,
				Key: key,
				Body: file.buffer,
				ContentType: file.mimetype,
				ContentLength: file.size,
			})

			await this.s3.send(command)
			this.logger.log(`Медиафайл для чата успешно загружен: ${key}`)
			return key
		} catch (error) {
			this.logger.error(`Ошибка при загрузке медиафайла для чата: ${error}`)
			throw new BadRequestException('Не удалось загрузить медиафайл')
		}
	}

	/**
	 * Получение списка архивов чатов для определенного пользователя
	 * @param userId ID пользователя в Telegram
	 * @returns Список ключей архивов
	 */
	async listChatArchives(userId: string): Promise<string[]> {
		try {
			// Использование ListObjectsV2Command для получения списка объектов в корзине с префиксом
			const { ListObjectsV2Command } = await import('@aws-sdk/client-s3')

			const prefix = `chat_archives/${userId}_`

			const command = new ListObjectsV2Command({
				Bucket: this.bucketName,
				Prefix: prefix,
			})

			const response = await this.s3.send(command)

			if (!response.Contents) {
				return []
			}

			return response.Contents.map(item => item.Key).filter(
				key => key !== undefined
			) as string[]
		} catch (error) {
			this.logger.error(
				`Ошибка при получении списка архивов чатов для пользователя ${userId}:`,
				error
			)
			return []
		}
	}

	async uploadUserArchive(key: string, buffer: Buffer): Promise<void> {
		try {
			const command = new PutObjectCommand({
				Bucket: this.bucketName,
				Key: key,
				Body: buffer,
				ContentType: 'application/json',
				ServerSideEncryption: 'AES256',
			})

			await this.s3.send(command)
			this.logger.debug(`Архив пользователя ${key} успешно загружен в S3`)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при загрузке архива пользователя ${key} в S3`,
				error?.stack,
				'StorageService',
				{ error }
			)
			throw error
		}
	}

	private getFileExtension(filename: string): string {
		return filename.split('.').pop() || 'jpg'
	}
}
