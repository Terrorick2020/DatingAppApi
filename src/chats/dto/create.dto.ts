import { IsString } from 'class-validator';
import { FindDto } from './find.dto';

export class CreateDto extends FindDto {
    @IsString()
    chatId!: string

    @IsString()
    toUser!: string

    @IsString()
    msg!: string
}
