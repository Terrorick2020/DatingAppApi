import { IsString, IsArray, ArrayUnique, IsNumber } from 'class-validator'

export class CreateRoomDto {
    @IsString()
    roomName!: string

    @IsNumber()
    ttl!: number

    @IsArray()
	@ArrayUnique()
	@IsString({ each: true })
    persons!: string[]
}
