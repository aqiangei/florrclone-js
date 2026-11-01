'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{FixedStepper}=require('../server/scheduler');
test('jitter uses fixed steps and a long pause has bounded catch-up',()=>{
  const stepper=new FixedStepper(30),steps=[];
  for(const elapsed of [.012,.023,.031,.001,.05,.016,.067])stepper.advance(elapsed,dt=>steps.push(dt));
  assert.equal(steps.length,6);assert.ok(steps.every(dt=>dt===1/30));
  const n=steps.length;stepper.advance(10,dt=>steps.push(dt));assert.equal(steps.length-n,3);assert.ok(stepper.droppedSeconds>9);
  assert.ok(stepper.accumulator<1/30);stepper.advance(1/30,dt=>steps.push(dt));assert.equal(steps.length-n,4);
});
