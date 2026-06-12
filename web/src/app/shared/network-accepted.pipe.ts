import { Pipe, PipeTransform } from '@angular/core';
import { NetworkMember } from '../core/models';

@Pipe({ name: 'networkAccepted', standalone: true })
export class NetworkAcceptedPipe implements PipeTransform {
  transform(members: NetworkMember[]): number {
    return members.filter(m => m.status === 'accepted').length;
  }
}