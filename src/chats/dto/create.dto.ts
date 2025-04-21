import { IsString } from 'class-validator';
import { FindDto } from './find.dto';

export class CreateDto extends FindDto {
    @IsString()
    toUser!: string
}
