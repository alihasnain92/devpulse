import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IncidentDto } from '@devpulse/shared';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { IncidentsService } from './incidents.service';

@Controller('incidents')
@UseGuards(CsrfGuard)
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAllForUser(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: 'active' | 'resolved' | 'all',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<IncidentDto[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;

    return this.incidentsService.findAllForUser(user.id, {
      status,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<IncidentDto> {
    return this.incidentsService.findOne(id, user.id);
  }
}
