import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsInt, Min, Max, IsEnum, IsString } from 'class-validator'
import { Type } from 'class-transformer'

export enum UserSortBy {
	CREATED_AT = 'createdAt',
	NAME = 'name',
	AGE = 'age',
}

export class FindAllUsersDto {
	@ApiProperty({
		description: 'Номер страницы',
		example: 1,
		default: 1,
		required: false,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number = 1

	@ApiProperty({
		description: 'Количество записей на странице',
		example: 10,
		default: 10,
		required: false,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit?: number = 10

	@ApiProperty({
		description: 'Поле для сортировки',
		enum: UserSortBy,
		default: UserSortBy.CREATED_AT,
		required: false,
	})
	@IsOptional()
	@IsEnum(UserSortBy)
	sortBy?: UserSortBy = UserSortBy.CREATED_AT

	@ApiProperty({
		description: 'Направление сортировки',
		enum: ['asc', 'desc'],
		default: 'desc',
		required: false,
	})
	@IsOptional()
	@IsEnum(['asc', 'desc'])
	sortDirection?: 'asc' | 'desc' = 'desc'

	@ApiProperty({
		description: 'Фильтр по имени',
		example: 'Алекс',
		required: false,
	})
	@IsOptional()
	@IsString()
	name?: string

	@ApiProperty({
		description: 'Фильтр по городу',
		example: 'Москва',
		required: false,
	})
	@IsOptional()
	@IsString()
	town?: string

	@ApiProperty({
		description: 'Минимальный возраст',
		example: 18,
		required: false,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(18)
	ageMin?: number

	@ApiProperty({
		description: 'Максимальный возраст',
		example: 30,
		required: false,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(18)
	ageMax?: number

	@ApiProperty({
		description: 'Фильтр по полу',
		enum: ['Male', 'Female', 'All'],
		required: false,
	})
	@IsOptional()
	@IsEnum(['Male', 'Female', 'All'])
	sex?: 'Male' | 'Female' | 'All'

	@ApiProperty({
		description: 'Фильтр по ID интереса',
		example: 1,
		required: false,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	interestId?: number

}
