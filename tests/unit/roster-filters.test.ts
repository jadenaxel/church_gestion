import { describe, expect, it } from 'vitest';
import { filterRoster } from '../../apps/web/components/roster-filters.js';
const members = [
  {id:'one',memberCode:'1',displayName:'Fixture one',email:'',phone:'',whatsapp:'',sex:'FEMALE',membershipStatus:'MEMBER',active:true,hasPhoto:true},
  {id:'two',memberCode:'2',displayName:'Fixture two',email:'',phone:'',whatsapp:'',sex:'MALE',membershipStatus:'VISITOR',active:true,hasPhoto:false},
  {id:'old',memberCode:'3',displayName:'Fixture inactive',email:'',phone:'',whatsapp:'',sex:'FEMALE',membershipStatus:'INACTIVE',active:false,hasPhoto:true}
];
describe('roster KPI drills', () => {
  it('uses the same authoritative birthday IDs as the metric, not all members', () => {
    expect(filterRoster(members,{search:'',sex:'ALL',status:'ACTIVE',focus:'BIRTHDAYS'},['two']).map((item)=>item.id)).toEqual(['two']);
  });
  it('shows only active profiles with photographs and preserves other filters', () => {
    expect(filterRoster(members,{search:'',sex:'ALL',status:'ACTIVE',focus:'PHOTO'}).map((item)=>item.id)).toEqual(['one']);
    expect(filterRoster(members,{search:'two',sex:'MALE',status:'ACTIVE',focus:'PHOTO'})).toEqual([]);
  });
  it('can clear every drill filter back to the active roster', () => {
    expect(filterRoster(members,{search:'',sex:'ALL',status:'ACTIVE',focus:'ALL'})).toHaveLength(2);
  });
});
