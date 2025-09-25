import { Transform } from 'class-transformer'
import { IsInt, IsString } from 'class-validator'

export class ViewShortVideoDto {
	@IsString()
	telegramId: string

	@Transform(({ value }) => parseInt(value))
	@IsInt()
	videoId: number
}
