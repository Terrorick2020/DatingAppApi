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
		const maxSize = 100 * 1024 * 1024 // 100MB
		if (video.size > maxSize) {
			throw new BadRequestException(
				'Размер видеофайла не должен превышать 100MB'
			)
		}

		// Проверяем тип файла
		const allowedTypes = [
			'video/mp4',
			'video/avi',
			'video/mov',
			'video/wmv',
			'video/webm',
		]
		if (!allowedTypes.includes(video.mimetype)) {
			throw new BadRequestException(
				'Неподдерживаемый формат видео. Разрешены: MP4, AVI, MOV, WMV, WebM'
			)
		}

		const key = `psychologist_videos/${randomUUID()}-${video.originalname}`

		try {
			const command = new PutObjectCommand({
				Bucket: this.bucketName,
				Key: key,
				Body: video.buffer,
				ContentType: video.mimetype,
				ContentLength: video.size,
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

			// В реальном приложении здесь должен быть код для извлечения кадра из видео
			// Для демонстрации пока возвращаем null, чтобы не создавать ложные превью
			this.logger.log(
				`Создание превью для видео: ${videoKey} -> ${previewKey} (пока не реализовано)`
			)

			// TODO: Реализовать извлечение кадра из видео с помощью ffmpeg или аналогичной библиотеки
			// Пока возвращаем null, чтобы не создавать ложные превью

			return null
		} catch (error) {
			this.logger.error(
				`Ошибка при создании превью для видео ${videoKey}: ${error}`
			)
			return null
		}
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
