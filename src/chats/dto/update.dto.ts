import { IsString } from 'class-validator';
import { FindDto } from './find.dto';

export class UpdateDto extends FindDto {
    @IsString()
    newLastMsgId!: string
}
