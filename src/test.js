//import DuckTimer from 'duck-timer';
const DuckTimer = require('duck-timer');
const timer = new DuckTimer.DuckTimer({ interval: 10000 }); // interval time: 100ms = 0.1sec.

// start.
timer.onInterval(res => {
  console.log(res.seconds);
}).start();

// // stop.
// timer.stop();

// // reset.
// timer.reset();