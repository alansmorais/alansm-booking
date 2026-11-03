import test from "node:test";
import assert from "node:assert/strict";
import { validateSchedulePeriods, saveScheduleSettings, saveScheduleException } from "../src/schedules.js";
test("valid weekly hours",()=>{assert.equal(validateSchedulePeriods([{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}]),true);assert.equal(validateSchedulePeriods([]),true);});
test("invalid overlapping periods and breaks",()=>{assert.equal(validateSchedulePeriods([{start:"09:00",end:"13:00"},{start:"12:00",end:"18:00"}]),false);assert.equal(validateSchedulePeriods([{start:"09:00",end:"18:00",breaks:[{start:"08:00",end:"09:30"}]}]),false);});
test("invalid schedule input is rejected before remote calls",async()=>{const claims={sub:"uid"};await assert.rejects(saveScheduleSettings(claims,{tenantId:"t1",scope:"company",days:{"7":[]}},{}),e=>e.code==="invalid-argument");await assert.rejects(saveScheduleException(claims,{tenantId:"t1",kind:"companyClosure",startDate:"2026-02-30"},{}),e=>e.code==="invalid-argument");});
