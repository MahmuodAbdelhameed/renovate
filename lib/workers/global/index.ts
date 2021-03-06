import path from 'path';
import is from '@sindresorhus/is';
import fs from 'fs-extra';
import * as configParser from '../../config';
import { getErrors, logger, setMeta } from '../../logger';
import { setUtilConfig } from '../../util';
import * as hostRules from '../../util/host-rules';
import * as repositoryWorker from '../repository';
import { autodiscoverRepositories } from './autodiscover';
import { globalFinalize, globalInitialize } from './initialize';
import * as limits from './limits';

type RenovateConfig = configParser.RenovateConfig;
type RenovateRepository = configParser.RenovateRepository;

export async function getRepositoryConfig(
  globalConfig: RenovateConfig,
  repository: RenovateRepository
): Promise<RenovateConfig> {
  const repoConfig = configParser.mergeChildConfig(
    globalConfig,
    is.string(repository) ? { repository } : repository
  );
  repoConfig.localDir = path.join(
    repoConfig.baseDir,
    `./repos/${repoConfig.platform}/${repoConfig.repository}`
  );
  await fs.ensureDir(repoConfig.localDir);
  delete repoConfig.baseDir;
  return configParser.filterConfig(repoConfig, 'repository');
}

function getGlobalConfig(): Promise<RenovateConfig> {
  return configParser.parseConfigs(process.env, process.argv);
}

function haveReachedLimits(): boolean {
  if (limits.getLimitRemaining('prCommitsPerRunLimit') <= 0) {
    logger.info('Max commits created for this run.');
    return true;
  }
  return false;
}

export async function start(): Promise<0 | 1> {
  let config: RenovateConfig;
  try {
    // read global config from file, env and cli args
    config = await getGlobalConfig();
    // initialize all submodules
    config = await globalInitialize(config);
    // autodiscover repositories (needs to come after platform initialization)
    config = await autodiscoverRepositories(config);
    // Iterate through repositories sequentially
    for (const repository of config.repositories) {
      if (haveReachedLimits()) {
        break;
      }
      const repoConfig = await getRepositoryConfig(config, repository);
      await setUtilConfig(repoConfig);
      if (repoConfig.hostRules) {
        hostRules.clear();
        repoConfig.hostRules.forEach((rule) => hostRules.add(rule));
        repoConfig.hostRules = [];
      }
      await repositoryWorker.renovateRepository(repoConfig);
      setMeta({});
    }
  } catch (err) /* istanbul ignore next */ {
    if (err.message.startsWith('Init: ')) {
      logger.fatal(err.message.substring(6));
    } else {
      logger.fatal({ err }, `Fatal error: ${err.message}`);
    }
  } finally {
    globalFinalize(config);
    logger.debug(`Renovate exiting`);
  }
  const loggerErrors = getErrors();
  /* istanbul ignore if */
  if (loggerErrors.length) {
    logger.info(
      { loggerErrors },
      'Renovate is exiting with a non-zero code due to the following logged errors'
    );
    return 1;
  }
  return 0;
}
