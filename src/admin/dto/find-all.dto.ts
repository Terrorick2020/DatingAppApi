import { IsEnum, IsNumber } from 'class-validator'
import { TypeAdminFindAll } from '../admin.type'


export class FindAllQueryDto {
    @IsEnum(TypeAdminFindAll)
    type!: TypeAdminFindAll

    @IsNumber()
    page!: number

    @IsNumber()
    count!: number
}