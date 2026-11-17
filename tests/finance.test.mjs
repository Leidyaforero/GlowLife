import test from 'node:test';
import assert from 'node:assert/strict';
import {dueDate,projection,monthlyCommitment,validatePocket,validDate} from '../public/finance-math.mjs';
const plan={name:'Computador',kind:'purchase',category:'Tecnología',description:'Para estudiar',target:3000000,balance:500000,contribution:250000,frequency:'monthly',firstDate:'2027-01-31',nextIndex:0};
test('monthly schedule preserves its original day after February',()=>{
 assert.equal(dueDate(plan,1),'2027-02-28');assert.equal(dueDate(plan,2),'2027-03-31');
 assert.equal(dueDate({...plan,firstDate:'2028-01-31'},1),'2028-02-29');
});
test('weekly, fifteen-day and twice-monthly schedules are distinct',()=>{
 assert.equal(dueDate({...plan,frequency:'weekly'},2),'2027-02-14');
 assert.equal(dueDate({...plan,frequency:'fortnightly'},2),'2027-03-02');
 const p={...plan,frequency:'twiceMonthly',firstDate:'2027-02-15'};
 assert.equal(dueDate(p,1),'2027-02-28');assert.equal(dueDate(p,2),'2027-03-15');assert.equal(dueDate(p,3),'2027-03-30');
});
test('projection subtracts actual savings and rounds the last contribution up',()=>{
 const p={...plan,target:1000000,balance:150000,contribution:300000};
 assert.deepEqual(projection(p,'2027-01-31'),{remaining:850000,count:3,months:2,date:'2027-03-31'});
 assert.equal(projection({...p,balance:300000},'2027-01-31').count,3);
 assert.equal(projection({...p,balance:1000000},'2027-01-31').count,0);
});
test('overdue contributions never turn into fictitious savings',()=>{
 const p={...plan,target:1000000,balance:0,contribution:250000};
 const result=projection(p,'2027-04-01');assert.equal(result.remaining,1000000);assert.equal(result.count,4);assert.equal(result.date,'2027-07-31');assert.equal(p.balance,0);
 assert.equal(projection({...p,nextIndex:5},'2027-04-01').date,'2027-09-30');
});
test('monthly commitments use the correct frequency',()=>{
 assert.equal(monthlyCommitment({...plan,contribution:100000,frequency:'twiceMonthly'}),200000);
 assert.equal(monthlyCommitment({...plan,contribution:12000,frequency:'weekly'}),52000);
});
test('invalid prices, categories, schedules and dates are rejected',()=>{
 assert.equal(validDate('2027-02-30'),false);assert.equal(validDate('2028-02-29'),true);
 assert.throws(()=>validatePocket({...plan,target:-1}));assert.throws(()=>validatePocket({...plan,contribution:0}));
 assert.throws(()=>validatePocket({...plan,target:100.5}));assert.throws(()=>validatePocket({...plan,category:'inventada'}));
 assert.throws(()=>validatePocket({...plan,frequency:'twiceMonthly'}));assert.equal(validatePocket(plan).name,'Computador');
});

test('unrealistically long plans remain representable without overflowing dates',()=>{
 const result=projection({...plan,target:1000000000000,balance:0,contribution:1},'2027-01-31');
 assert.equal(result.tooLong,true);assert.equal(result.date,null);assert.equal(result.count,1000000000000);
});
