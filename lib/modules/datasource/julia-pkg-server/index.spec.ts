import { getPkgReleases } from '..';
import * as httpMock from '../../../../test/http-mock';
import { logger } from '../../../../test/util';
import { createRegistryTarballFromFixture } from './test';
import {
  buildRegistryUrl,
  defaultPkgServer,
  defaultRegistryUrl,
  generalRegistryUUID,
  juliaPkgServerDatasourceId,
} from './common';

const datasource = juliaPkgServerDatasourceId;
const eagerGeneralRegistryState = '1111111111111111111111111111111111111111';

const generalRegistryPath = `/registry/${generalRegistryUUID}/${eagerGeneralRegistryState}`;
const eagerRegistriesPath = '/registries.eager';
const eagerRegistriesResponse = `${generalRegistryPath}\n`;

describe('modules/datasource/julia-pkg-server/index', () => {
  describe('getReleases', () => {
    it('returns null for non-existent packages', async () => {
      const packageName = 'non_existent_package';
      const generalRegistryResponse =
        await createRegistryTarballFromFixture('General');

      httpMock
        .scope(defaultPkgServer)
        .get(eagerRegistriesPath)
        .reply(200, eagerRegistriesResponse)
        .get(generalRegistryPath)
        .reply(200, generalRegistryResponse);

      expect(
        await getPkgReleases({
          datasource,
          packageName,
        }),
      ).toBeNull();
    });

    it('warns when a registry cannot be fetched', async () => {
      httpMock
        .scope(defaultPkgServer)
        .get(eagerRegistriesPath)
        .reply(200, eagerRegistriesResponse)
        .get(generalRegistryPath)
        .reply(404);

      expect(
        await getPkgReleases({
          datasource,
          packageName: 'HTTP',
        }),
      ).toBeNull();

      expect(logger.logger.warn).toHaveBeenCalledWith(
        {
          datasource,
          // This is the error corresponding to the HTTP request which is not
          // straightforward to replicate in test
          error: expect.anything(),
          registryUrl: `${defaultRegistryUrl}/${eagerGeneralRegistryState}`,
        },
        'An error occurred fetching the registry',
      );
    });

    it('returns package information for existing packages', async () => {
      const expectedResult = {
        sourceUrl: 'https://github.com/JuliaWeb/HTTP.jl',
        releases: [
          { version: '0.1.0' },
          { version: '0.2.0' },
          { version: '0.2.1', isDeprecated: true },
          { version: '1.0.0' },
          { version: '1.1.0' },
        ],
        registryUrl: buildRegistryUrl(
          defaultPkgServer,
          generalRegistryUUID,
          eagerGeneralRegistryState,
        ),
      };
      const generalRegistryResponse =
        await createRegistryTarballFromFixture('General');

      httpMock
        .scope(defaultPkgServer)
        .get(eagerRegistriesPath)
        .reply(200, eagerRegistriesResponse)
        .get(generalRegistryPath)
        .reply(200, generalRegistryResponse);

      const result = await getPkgReleases({
        datasource,
        packageName: 'HTTP',
      });

      expect(result).toEqual(expectedResult);
    });

    describe('custom package servers', () => {
      it('supports package servers other than https://pkg.julialang.org', async () => {
        const customPkgServer = 'https://example.com';
        const expectedResult = {
          sourceUrl: 'https://github.com/JuliaWeb/HTTP.jl',
          releases: [
            { version: '0.1.0' },
            { version: '0.2.0' },
            { version: '0.2.1', isDeprecated: true },
            { version: '1.0.0' },
            { version: '1.1.0' },
          ],
          registryUrl: buildRegistryUrl(
            customPkgServer,
            generalRegistryUUID,
            eagerGeneralRegistryState,
          ),
        };
        const generalRegistryResponse =
          await createRegistryTarballFromFixture('General');

        httpMock
          .scope(customPkgServer)
          .get(eagerRegistriesPath)
          .reply(200, eagerRegistriesResponse)
          .get(generalRegistryPath)
          .reply(200, generalRegistryResponse);

        const result = await getPkgReleases({
          datasource,
          packageName: 'HTTP',
          registryUrls: [
            buildRegistryUrl(customPkgServer, generalRegistryUUID),
          ],
        });

        expect(result).toEqual(expectedResult);
      });

      it('returns null for wrong registry URLs', async () => {
        expect(
          await getPkgReleases({
            datasource,
            packageName: 'HTTP',
            registryUrls: ['https://foo.bar/not-a-registry-path'],
          }),
        ).toBeNull();
      });

      it('merges multiple registries', async () => {
        const customPkgServer = 'https://example.com';
        // Contains an additional version (v0.3.0) for the HTTP package
        const extraHTTPRegistryResponse =
          await createRegistryTarballFromFixture('ExtraHTTP');
        const generalRegistryResponse =
          await createRegistryTarballFromFixture('General');

        httpMock
          .scope(defaultPkgServer)
          .get(eagerRegistriesPath)
          .reply(200, eagerRegistriesResponse)
          .get(generalRegistryPath)
          .reply(200, generalRegistryResponse);

        httpMock
          .scope(customPkgServer)
          .get(eagerRegistriesPath)
          .reply(200, eagerRegistriesResponse)
          .get(generalRegistryPath)
          .reply(200, extraHTTPRegistryResponse);

        const result = await getPkgReleases({
          datasource,
          packageName: 'HTTP',
          registryUrls: [
            defaultRegistryUrl,
            buildRegistryUrl(customPkgServer, generalRegistryUUID),
          ],
        });

        expect(result?.releases).toEqual(
          expect.arrayContaining([
            {
              registryUrl: buildRegistryUrl(
                customPkgServer,
                generalRegistryUUID,
                eagerGeneralRegistryState,
              ),
              version: '0.2.0',
            },
            {
              registryUrl: buildRegistryUrl(
                defaultPkgServer,
                generalRegistryUUID,
                eagerGeneralRegistryState,
              ),
              version: '1.0.0',
            },
          ]),
        );
      });
    });
  });
});
