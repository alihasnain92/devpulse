import { Controller, Get } from '@nestjs/common';
import { UserDto } from '@devpulse/shared';
import { UsersService } from './users.service';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(@CurrentUser() user: AuthenticatedUser): Promise<UserDto> {
    return this.usersService.findById(user.id);
  }
}
