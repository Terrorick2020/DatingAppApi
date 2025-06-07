import { IsString } from 'class-validator'

export class GetRegionsDto {
    @IsString()
    cityId!: string
}
