import { IsString } from 'class-validator';

export class ConnectionDto {
    @IsString()
    roomName!: string

    @IsString()
    telegramId!: string    
}
