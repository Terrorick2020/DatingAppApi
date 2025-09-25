import { IsBoolean, IsNotEmpty, IsString } from 'class-validator'

export class LikeVideoDto {
	@IsString()
	@IsNotEmpty()
	userId: string

	@IsBoolean()
	@IsNotEmpty()
	isLiked: boolean
}
