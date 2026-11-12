import { resolve } from 'node:path';
import { seedRankingDemo } from './ranking-demo.js';
console.log(JSON.stringify(seedRankingDemo(resolve(process.env.SQLITE_PATH ?? './data/like-cidade.sqlite')),null,2));
