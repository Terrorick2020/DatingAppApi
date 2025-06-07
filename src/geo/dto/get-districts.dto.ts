import { IsString, IsNotEmpty } from 'class-validator'

export class GetDistrictsDto {
	@IsString()
	@IsNotEmpty()
	city!: string
}
