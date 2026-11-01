'use strict';
// Physics and network delivery have separate budgets. Render interpolation
// keeps animation at display refresh rate without decoding 60 full worlds/s.
module.exports={TICK_HZ:30,SNAPSHOT_HZ:20};
