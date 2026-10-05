import {Agent,setGlobalDispatcher} from 'undici';

// Large video uploads may take longer than the default response-header timeout.
setGlobalDispatcher(new Agent({headersTimeout:0,bodyTimeout:0,connect:{timeout:30000}}));
