import { IsNumber, IsBoolean } from 'class-validator'

export class SetGeoDto {
	@IsNumber()
	latitude!: number

	@IsNumber()
	longitude!: number

	@IsBoolean()
	enableGeo!: boolean
}
