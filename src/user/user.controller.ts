import {
	Controller,
	Get,
	Post,
	Body,
	Patch,
	Param,
	Delete,
} from '@nestjs/common'
import { UserService } from './user.service'
import { UpdateUserDto } from './dto/update-user.dto'
import { SkipBlockedCheck } from '../common/decorators/public.decorator'
import { AdminOnly } from '../common/decorators/admin-only.decorators'

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
