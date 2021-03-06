import { GetReleasesConfig, ReleaseResult } from '../common';
import { getDependency } from './get';
import { getRubygemsOrgDependency } from './get-rubygems-org';

export async function getReleases({
  lookupName,
  registryUrl,
}: GetReleasesConfig): Promise<ReleaseResult | null> {
  // prettier-ignore
  if (registryUrl.endsWith('rubygems.org')) { // lgtm [js/incomplete-url-substring-sanitization]
      return getRubygemsOrgDependency(lookupName);
    }
  return getDependency({ dependency: lookupName, registry: registryUrl });
}
