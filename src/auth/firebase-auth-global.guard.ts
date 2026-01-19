import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Global Firebase authentication guard
 * Applies Firebase authentication to all routes by default
 * Use @Public() decorator to exclude specific routes
 */
@Injectable()
export class FirebaseAuthGlobalGuard extends AuthGuard('firebase') {
    constructor(private reflector: Reflector) {
        super();
    }

    canActivate(context: ExecutionContext) {
        // Check if the route is marked as public
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) {
            return true;
        }

        // Otherwise, apply Firebase authentication
        return super.canActivate(context);
    }
}
