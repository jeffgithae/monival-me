import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import type { JwtPayload } from '../common/types/jwt-payload';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET is required');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload & { _id: string }> {
    // tokenVersion check — rejects tokens after password change / forced logout
    if (payload.tokenVersion !== undefined) {
      const user = await this.userModel
        .findById(payload.sub)
        .select('tokenVersion')
        .lean();
      if (!user) throw new UnauthorizedException('User not found');
      if ((user.tokenVersion ?? 0) !== payload.tokenVersion) {
        throw new UnauthorizedException('Token has been revoked — please log in again');
      }
    }
    return { ...payload, _id: payload.sub };
  }
}