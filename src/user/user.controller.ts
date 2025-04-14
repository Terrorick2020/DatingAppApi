import {
	Controller,
	Get,
	Post,
	Body,
	Patch,
	Param,
	Delete,
	Query,
} from '@nestjs/common'
import { UserService } from './user.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'

@Controller('user')
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Post()
	create(@Body() dto: CreateUserDto) {
		return this.userService.create(dto)
	}

	@Get()
	findAll() {
		return this.userService.findAll()
	}

	@Get(':id')
	findOne(@Param('id') id: string) {
		return this.userService.findOne(+id)
	}

	@Patch(':id')
	update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
		return this.userService.update(+id, dto)
	}

	@Delete(':id')
	remove(@Param('id') id: string) {
		return this.userService.remove(+id)
	}

	@Get('by-telegram/:telegramId')
	findByTelegramId(@Param('telegramId') telegramId: string) {
		return this.userService.findByTelegramId(telegramId)
	}

	@Get('public/:id')
	getPublicProfile(@Param('id') id: string) {
		return this.userService.getPublicProfile(+id)
	}
}
