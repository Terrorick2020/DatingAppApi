// multer.config.ts
import { HttpException, HttpStatus } from '@nestjs/common'
import { memoryStorage } from 'multer'
import { extname } from 'path'

const fileSizeLimit =
	parseInt(process.env.MAX_FILE_SIZE_MB || '30', 10) * 1024 * 1024

export const multerOptions = {
	storage: memoryStorage(),

	fileFilter: (req: any, file: any, cb: any) => {
		if (file.mimetype.match(/^image\//)) {
			cb(null, true)
		} else {
			cb(
				new HttpException(
					`Unsupported file type ${extname(file.originalname)}`,
					HttpStatus.BAD_REQUEST
				),
				false
			)
		}
	},

	limits: {
		fileSize: fileSizeLimit,
	},
}
