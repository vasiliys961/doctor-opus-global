import {it,expect} from 'vitest';
import {assessDermoscopicTriage} from './derm-risk-triage';
const obs=(sign:string,desc:string)=>({
  findings:[{sign,desc,is_norm:false}],study:{image_quality:'good'}
});
it('flags misleading benign confidence with a growing-nevus-like peripheral globular rim when age/history absent',()=>{
 const r=assessDermoscopicTriage({observation:obs('peripheral globules','Regularly arranged globules form a ring along the entire margin'),
  prediction:'benign'});
 expect(r.triage).toBe('specialist_review');
 expect(r.confidenceOverride).toBe(true);
});
it('does not treat negated history or absent visible findings as melanoma',()=>{
 expect(assessDermoscopicTriage({observation:obs('regular reticular pigment','Faint symmetric mesh'),
  prediction:'benign'}).triage).toBe('benign_appearing');
 expect(assessDermoscopicTriage({observation:{findings:[{sign:'peripheral globules',is_norm:true}]},
  prediction:'benign'}).triage).toBe('benign_appearing');
});
it('does not turn a concerning lesion into a benign diagnosis merely because of a recorded age',()=>{
 expect(assessDermoscopicTriage({observation:obs('peripheral globules','brown rim globules'),
  prediction:'malignant',ageYears:20}).triage).toBe('urgent_specialist_review');
});
