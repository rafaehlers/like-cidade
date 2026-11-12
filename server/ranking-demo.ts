import { CATEGORIES, PEOPLE } from '../src/domain.js';
import { PILOT_CITIES, type PointAction } from '../src/profiles.js';
import { IssueDatabase } from './database.js';

export function seedRankingDemo(databasePath:string,now=new Date()) {
  const store=new IssueDatabase(databasePath);const db=store.db;
  const actors=Object.keys(PEOPLE).filter(id=>PEOPLE[id].type==='resident');
  const reports=[150,95,60,32,14];const supports=[10,20,50,35,25];const accessibility=[12,10,7,4,1];
  let inserted=0;
  try {
    db.exec('BEGIN IMMEDIATE');
    for(const [index,userId] of actors.entries()) {
      for(const action of ['report','support'] as const satisfies readonly PointAction[]) {
        const count=(action==='report'?reports:supports)[index];
        for(let i=0;i<count;i++) {
          const id=`demo-ranking-v1:${userId}:${action}:${i}`;
          const city=PILOT_CITIES[(i+index)%PILOT_CITIES.length];
          const recent=i%10;const days=recent<2?recent*2+(index%2):recent<5?8+(i%16):32+(i%24);
          const at=new Date(now.getTime()-days*86400000-(i+1)*60000).toISOString();
          const category=action==='report' && i<accessibility[index]?'Calçada':CATEGORIES[i%CATEGORIES.length];
          const subcategory=action==='report' && i<accessibility[index]?(i%2?'Piso tátil danificado':'Rampa de acesso ausente'):null;
          const result=db.prepare('INSERT OR IGNORE INTO demo_point_ledger VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
            id,userId,action,action==='report'?10:2,`demo-ranking-activity:${index}:${action}:${i}`,
            `${action==='report'?'Relato':'Apoio'} fictício — ${city}`,category,subcategory,at,
            `Demonstração fictícia: ${action==='report'?'ocorrência registrada':'apoio a outra ocorrência'}`,city,
          );
          inserted+=Number(result.changes);
        }
      }
    }
    if(inserted)db.prepare("UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='revision'").run();
    db.exec('COMMIT');
    return {inserted,residents:actors.length,revision:store.revision,rankings:store.profiles.ranking({period:'all',city:'all',theme:'all'},store.revision,now).rows.map(row=>({nickname:row.profile.nickname,points:row.points,position:row.position}))};
  } catch(error) {if(db.isTransaction)db.exec('ROLLBACK');throw error;} finally {store.close();}
}
