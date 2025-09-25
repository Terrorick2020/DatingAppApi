import { IsNotEmpty, IsString } from 'class-validator'

export class ViewVideoDto {
	@IsString()
	@IsNotEmpty()
	userId: string
}
