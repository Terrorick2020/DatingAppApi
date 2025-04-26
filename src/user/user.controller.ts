import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserService } from './user.service'

@Controller('user')
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Get()
	findAll() {
		return this.userService.findAll()
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
