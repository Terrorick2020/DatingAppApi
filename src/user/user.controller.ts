import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserService } from './user.service'
import { FindAllUsersDto } from './dto/find-all-users.dto'

@Controller('user')
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Get()
	findAll(@Query() queryParams: FindAllUsersDto) {
		return this.userService.findAll(queryParams)
	}

	@Patch(':telegramId')
	update(@Param('telegramId') telegramId: string, @Body() dto: UpdateUserDto) {
		return this.userService.update(telegramId, dto)
	}

	@AdminOnly()
	@Delete(':telegramId')
	remove(@Param('telegramId') telegramId: string) {
		return this.userService.remove(telegramId)
	}

	@Get(':telegramId')
	findByTelegramId(@Param('telegramId') telegramId: string) {
		return this.userService.findByTelegramId(telegramId)
	}

	@Get('public/:telegramId')
	getPublicProfile(@Param('telegramId') telegramId: string) {
		return this.userService.getPublicProfile(telegramId)
	}
}
