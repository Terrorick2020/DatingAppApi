import { ApiProperty } from '@nestjs/swagger'
import { UploadPhotoRequestDto } from './upload-photo-request.dto'
import { IsNotEmpty, IsString } from 'class-validator'

export class UploadPhotoInternalDto extends UploadPhotoRequestDto {
    @ApiProperty({
        description: 'Ключ файла в хранилище',
        example: 'user_photos/123abc.jpg'
    })
    @IsString()
    @IsNotEmpty()
    key: string;
    
}
