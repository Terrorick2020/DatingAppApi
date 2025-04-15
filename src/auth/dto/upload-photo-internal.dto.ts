import { UploadPhotoRequestDto } from './upload-photo-request.dto'
import { IsNotEmpty, IsString } from 'class-validator'

export class UploadPhotoInternalDto extends UploadPhotoRequestDto {
	@IsString()
	@IsNotEmpty()
	key!: string
}
