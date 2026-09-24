import {it,expect} from 'vitest';
import {scoreReportQuality} from '../report-quality-gate';
const signals={citation_count:2,orphaned_citation_count:0,uncovered_finding_count:0,avg_prose_length:1500};
const summary='La resolución devuelve los autos al tribunal de origen para que dicte la sentencia que corresponda. [DOC 1 p.31]';
it('scores a LIMITED verification report on its permitted content, without demanding litigation motions or a failed optional memo',()=>{
 const result=scoreReportQuality({prose:{executive_summary:summary}}, {...signals,chunk_success:{narrative:true,memo:false,intelligence:false}},2,undefined,{reportMode:'LIMITED',strategyAllowed:false});
 expect(result.passed).toBe(true);
 expect(result.dimensions.motion_quality.max).toBe(0);
 expect(scoreReportQuality({prose:{}},signals,2,undefined,{reportMode:'LIMITED',strategyAllowed:false}).passed).toBe(false);
 expect(scoreReportQuality({prose:{executive_summary:summary}},{...signals,orphaned_citation_count:1},2,undefined,{reportMode:'LIMITED',strategyAllowed:false}).passed).toBe(false);
});
it('recognizes Mexican legal authority instead of requiring US reporter or versus citations',()=>{
 const parsed={legal_memorandum:{legal_analysis:[{issue:'Si la detención administrativa excedió el plazo constitucional.',rule:'El artículo 21 de la Constitución Política de los Estados Unidos Mexicanos establece el límite aplicable.',application:'La resolución identifica la duración de la detención administrativa en [DOC 1 p.3].',conclusion:'La cuestión examinada corresponde al límite constitucional de detención.'}]}};
 expect(scoreReportQuality(parsed,signals,1).dimensions.memo_completeness.score).toBe(10);
});
