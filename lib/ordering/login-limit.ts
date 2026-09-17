import 'server-only';
import {allowLogin} from '../workroom/login-limit';
/** Same persistent client limit, with staff and owner buckets kept separate. */
export const allowKitchenLogin=(client:string,now=Date.now())=>allowLogin(client,now,'kitchen');
