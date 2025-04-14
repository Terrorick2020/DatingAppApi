import { BadRequestException, Injectable } from '@nestjs/common'
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

		const command = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: key,
			Body: photo.buffer, 
			ContentType: photo.mimetype,
			ContentLength: photo.size, 
		})

		await this.s3.send(command)
		return key
	}

	async getPresignedUrl(key: string): Promise<string> {
		const command = new GetObjectCommand({
			Bucket: this.bucketName,
			Key: key,
		})

		return await getSignedUrl(this.s3, command, { expiresIn: 60 })
	}

	async deletePhoto(key: string): Promise<void> {
		const command = new DeleteObjectCommand({
			Bucket: this.bucketName,
			Key: key,
		})

		await this.s3.send(command)
	}

	async updatePhoto(
		oldKey: string,
		newPhoto: Express.Multer.File
	): Promise<string> {
		await this.deletePhoto(oldKey)
		return this.uploadPhoto(newPhoto)
	}
}
