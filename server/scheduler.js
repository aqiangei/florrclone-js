'use strict';
// Clock jitter never changes the combat integration step. Catch-up is bounded
// so a stalled process cannot monopolize the event loop replaying old work.
class FixedStepper{
  constructor(hz,maxCatchUp=3){this.step=1/hz;this.maxCatchUp=maxCatchUp;this.accumulator=0;this.droppedSeconds=0;}
  advance(elapsed,update){
    this.accumulator+=Math.max(0,elapsed);let count=0;
    while(this.accumulator+1e-9>=this.step&&count<this.maxCatchUp){update(this.step);this.accumulator-=this.step;count++;}
    if(this.accumulator>=this.step){const dropped=Math.floor(this.accumulator/this.step)*this.step;this.accumulator-=dropped;this.droppedSeconds+=dropped;}
    return count;
  }
}
module.exports={FixedStepper};
