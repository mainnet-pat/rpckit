// deno-fmt-ignore-file
// biome-ignore format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages, GetConfigResponse } from 'waku/router';


// prettier-ignore
type Page =
| { path: '/'; render: 'static' }
| { path: '/docs/changelog'; render: 'static' }
| { path: '/docs/demo'; render: 'static' }
| { path: '/docs/getting-started'; render: 'static' }
| { path: '/docs/installation'; render: 'static' }
| { path: '/docs/introduction'; render: 'static' }
| { path: '/docs/utilities/batch-scheduler'; render: 'static' }
| { path: '/docs/utilities/parse'; render: 'static' }
| { path: '/docs/utilities/with-retry'; render: 'static' }
| { path: '/docs/transports/cluster'; render: 'static' }
| { path: '/docs/transports/fallback'; render: 'static' }
| { path: '/docs/transports/http'; render: 'static' }
| { path: '/docs/transports/overview'; render: 'static' }
| { path: '/docs/transports/tcp'; render: 'static' }
| { path: '/docs/transports/websocket'; render: 'static' }
| { path: '/docs/protocols/electrum-cash'; render: 'static' }
| { path: '/docs/protocols/ethereum'; render: 'static' };

// prettier-ignore
declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<Page>;
  }
  interface CreatePagesConfig {
    pages: Page;
  }
}
