import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import {
	S3Client,
	PutObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
} from '@aws-sdk/client-s3'
import { config } from 'dotenv'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

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

	async getPresignedUrl(key: string, expiresIn: number = 60): Promise<string> {
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
}
