import importlib.util
import errno
import io
import json
from pathlib import Path
import tempfile
import tarfile
import unittest
from unittest.mock import MagicMock, patch
import zipfile

spec = importlib.util.spec_from_file_location('recovery', Path(__file__).with_name('trial-recovery.py'))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class RecoverySafety(unittest.TestCase):
    def release_fixture(self, root):
        root = root.resolve()
        release, web = root / 'release', root / 'owner/apps/web'
        release.mkdir(mode=0o700)
        (web / '.convex/local/default').mkdir(parents=True)
        config = {'deploymentName': 'anonymous-agent', 'ports': {'cloud': 3220, 'site': 3221}, 'backendVersion': 'fixture'}
        recovery.private_write(web / '.convex/local/default/config.json', json.dumps(config).encode())
        code = release / 'code'
        for name, data in {'convex/schema.ts': b'fixture schema', 'apps/web/src/app.ts': b'fixture application'}.items():
            path = code / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        source_hashes = {str(path.relative_to(code)): recovery.digest(path.read_bytes()) for path in code.rglob('*') if path.is_file()}
        source = recovery.build_archive(code, source_hashes)
        recovery.private_write(release / 'source.tar', source)
        build = code / 'apps/web/dist'
        (build / 'client').mkdir(parents=True)
        (build / 'client/offline-assets.json').write_bytes(b'fixture offline assets')
        (build / 'client/manifest.webmanifest').write_bytes(b'fixture manifest')
        build_hashes = {str(path.relative_to(build)): recovery.digest(path.read_bytes()) for path in build.rglob('*') if path.is_file()}
        head, phone = 'a' * 40, 'https://macbook-pro.tail221f42.ts.net:10443'
        shared = {'candidate': head, 'backendPid': 42, 'buildId': 'fixture-build', 'backend': 'anonymous-agent',
                  'phoneOrigin': phone, 'ports': config['ports'], 'webPid': 43, 'sourceArchiveSha256': recovery.digest(source)}
        prepared = {**shared, 'root': str(release), 'sourceFiles': source_hashes, 'buildFiles': build_hashes,
                    'remoteBackendPort': 10444,
                    'ownerConfigSha256': recovery.digest((web / '.convex/local/default/config.json').read_bytes())}
        accepted = {**shared, 'sourceFiles': source_hashes, 'buildFiles': build_hashes, 'publicBuildAssetsMatched': True,
                    'ownerConfigUnchanged': True, 'authConfigurationUnchanged': True}
        for name, value in [('prepared.json', prepared), ('phone-verified.json', accepted),
                            ('deployed.json', shared), ('cutover.json', {**shared, 'webPort': 3006})]:
            recovery.private_write(release / name, json.dumps(value).encode())
        return release, web, config, source

    def test_served_release_binds_exact_commit_source_and_build(self):
        with tempfile.TemporaryDirectory() as root:
            release, web, config, source = self.release_fixture(Path(root))
            with patch.object(recovery, 'run', return_value=source) as git:
                archived_source, build, binding = recovery.release_source(web, config, release)
            self.assertEqual(archived_source, source)
            self.assertEqual(recovery.archive_hashes(build), binding['buildFiles'])
            self.assertEqual(binding['head'], 'a' * 40)
            git.assert_called_once_with(['git', 'archive', '--format=tar', 'a' * 40], recovery.REPO)
            with patch.object(recovery, 'run', return_value=b'other commit'):
                with self.assertRaisesRegex(ValueError, 'reviewed commit'):
                    recovery.release_source(web, config, release)
            (release / 'code/apps/web/src/app.ts').write_bytes(b'changed application')
            with patch.object(recovery, 'run', return_value=source), self.assertRaisesRegex(ValueError, 'file binding differs'):
                recovery.release_source(web, config, release)

    def test_served_release_refuses_backend_receipt_and_build_drift(self):
        with tempfile.TemporaryDirectory() as root:
            release, web, config, source = self.release_fixture(Path(root))
            with self.assertRaisesRegex(ValueError, 'owner/backend binding'):
                recovery.release_source(web, {**config, 'deploymentName': 'other'}, release)
            path = release / 'phone-verified.json'
            accepted = json.loads(path.read_text())
            path.write_text(json.dumps({**accepted, 'candidate': 'b' * 40}))
            with self.assertRaisesRegex(ValueError, 'deployment/acceptance'):
                recovery.release_source(web, config, release)
            path.write_text(json.dumps(accepted))
            (release / 'code/apps/web/dist/client/injected.js').write_bytes(b'unbound')
            with patch.object(recovery, 'run', return_value=source), self.assertRaisesRegex(ValueError, 'unbound files'):
                recovery.release_source(web, config, release)

    def test_new_release_accepts_only_reviewed_phone_origins(self):
        with tempfile.TemporaryDirectory() as root:
            release, web, config, source = self.release_fixture(Path(root))
            for origin, allowed in [('https://macbook-pro.tail221f42.ts.net', True), ('https://other.example', False)]:
                for name in ['prepared.json', 'phone-verified.json', 'deployed.json', 'cutover.json']:
                    path = release / name
                    path.write_text(json.dumps({**json.loads(path.read_text()), 'phoneOrigin': origin}))
                with patch.object(recovery, 'run', return_value=source):
                    if allowed:
                        self.assertEqual(recovery.release_source(web, config, release)[2]['phoneOrigin'], origin)
                    else:
                        with self.assertRaisesRegex(ValueError, 'source/build acceptance'):
                            recovery.release_source(web, config, release)

    def test_archives_and_file_bindings_refuse_paths_links_and_duplicates(self):
        for names in [('one', 'one'), ('../escape',), ('/absolute',), ('a/../b',)]:
            data = io.BytesIO()
            with tarfile.open(fileobj=data, mode='w') as archive:
                for name in names:
                    archive.addfile(tarfile.TarInfo(name))
            with self.assertRaisesRegex(ValueError, 'Unsafe release archive'):
                recovery.archive_hashes(data.getvalue())
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode='w') as archive:
            link = tarfile.TarInfo('linked')
            link.type, link.linkname = tarfile.SYMTYPE, '/private/outside'
            archive.addfile(link)
        with self.assertRaisesRegex(ValueError, 'Unsafe release archive'):
            recovery.archive_hashes(data.getvalue())
        with tempfile.TemporaryDirectory() as root:
            root = Path(root).resolve()
            (root / 'file').write_bytes(b'fixture')
            (root / 'linked').symlink_to(root / 'file')
            for name in ['../escape', '/absolute', 'linked']:
                with self.assertRaises(ValueError):
                    recovery.bound_files(root, {name: recovery.digest(b'fixture')})

    def test_serving_checks_live_processes_and_public_assets(self):
        with tempfile.TemporaryDirectory() as root:
            release, web, config, source = self.release_fixture(Path(root))
            with patch.object(recovery, 'run', return_value=source):
                _, _, binding = recovery.release_source(web, config, release)
            binary = Path.home() / '.cache/convex/binaries/fixture/convex-local-backend'
            process = f'{binary} --port 3220 --site-proxy-port 3221 --instance-name anonymous-agent --local-storage {web}/.convex/local/default/convex_local_storage'
            listener, cwd = b'p43\nn127.0.0.1:3006\n', f'p43\nn{release}/code/apps/web\n'.encode()
            def response(data):
                item = MagicMock()
                item.__enter__.return_value.read.return_value = data
                item.__enter__.return_value.status = 200
                return item
            values = [b'anonymous-agent', b'fixture offline assets', b'fixture manifest', b'']
            with patch.object(recovery, 'run', side_effect=[process.encode(), listener, cwd]), \
                    patch.object(recovery.urllib.request, 'urlopen', side_effect=[response(value) for value in values]):
                recovery.check_serving(web, config, binding)
            with patch.object(recovery, 'run', side_effect=[process.encode(), b'p99\nn127.0.0.1:3006\n', cwd]), \
                    self.assertRaisesRegex(ValueError, 'Live phone preview'):
                recovery.check_serving(web, config, binding)
            with patch.object(recovery, 'run', side_effect=[process.encode(), listener, cwd]), \
                    patch.object(recovery.urllib.request, 'urlopen', side_effect=[response(values[0]), response(b'different build')]), \
                    self.assertRaisesRegex(ValueError, 'Served phone build'):
                recovery.check_serving(web, config, binding)

    def test_release_archive_verification_detects_build_tampering(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root).resolve()
            release, web, config, source = self.release_fixture(root)
            with patch.object(recovery, 'run', return_value=source):
                source, build, binding = recovery.release_source(web, config, release)
            snapshot = root / 'snapshot'
            snapshot.mkdir(mode=0o700)
            with zipfile.ZipFile(snapshot / 'snapshot.zip', 'w') as archive:
                archive.writestr('_components/betterAuth/user/documents.jsonl', '{"_id":"fixture"}\n')
            (snapshot / 'snapshot.zip').chmod(0o600)
            for name, data in [('source.tar', source), ('phone-build.tar', build),
                               ('release-binding.json', json.dumps(binding).encode()), ('configuration.env', b'fixture')]:
                recovery.private_write(snapshot / name, data)
            manifest = {'format': 'washcloset-trial-recovery/v1', 'source': {'head': binding['head'], 'buildId': binding['buildId'],
                        'deploymentName': config['deploymentName'], 'ports': config['ports']},
                        'schemaSha256': binding['sourceFiles']['convex/schema.ts'],
                        'coverage': recovery.inventory(snapshot / 'snapshot.zip'),
                        'sha256': {name: recovery.digest((snapshot / name).read_bytes()) for name in recovery.SNAPSHOT_ARTIFACTS | recovery.RELEASE_ARTIFACTS}}
            def write_manifest():
                (snapshot / 'manifest.json').write_text(json.dumps(manifest))
                (snapshot / 'manifest.json').chmod(0o600)
                (snapshot / 'manifest.sha256').write_text(recovery.digest((snapshot / 'manifest.json').read_bytes()))
                (snapshot / 'manifest.sha256').chmod(0o600)
            write_manifest()
            self.assertEqual(recovery.verify(snapshot), manifest)
            (snapshot / 'phone-build.tar').write_bytes(b'changed build')
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                recovery.verify(snapshot)
            (snapshot / 'phone-build.tar').write_bytes(build)
            binding['buildFiles']['client/manifest.webmanifest'] = 'b' * 64
            (snapshot / 'release-binding.json').write_text(json.dumps(binding))
            manifest['sha256']['release-binding.json'] = recovery.digest((snapshot / 'release-binding.json').read_bytes())
            write_manifest()
            with self.assertRaisesRegex(ValueError, 'Archived release bindings'):
                recovery.verify(snapshot)

    def test_capture_at_portless_origin_preserves_original_acceptance_binding(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root).resolve()
            release, web, config, source = self.release_fixture(root)
            destination = root / 'backups'
            destination.mkdir(mode=0o700)
            def native(args, _config, directory):
                if args[0] == 'export':
                    with zipfile.ZipFile(directory / 'snapshot.zip', 'w') as archive:
                        archive.writestr('_components/betterAuth/user/documents.jsonl', '{"_id":"fixture"}\n')
                    return b''
                return b'SITE_URL=https://macbook-pro.tail221f42.ts.net\n'
            origin = 'https://macbook-pro.tail221f42.ts.net'
            with patch.object(recovery, 'run', side_effect=lambda args, *_: source if args[0] == 'git' else b'fixture-version'), \
                    patch.object(recovery, 'source_config', return_value=(web, config)), \
                    patch.object(recovery, 'check_serving') as serving, patch.object(recovery, 'native', side_effect=native):
                recovery.capture(web, destination, release, phone_origin=origin)
            self.assertEqual(serving.call_count, 2)
            self.assertTrue(all(call.args[2]['phoneOrigin'] == origin for call in serving.call_args_list))
            snapshot = next(destination.glob('snapshot-*'))
            binding = json.loads((snapshot / 'release-binding.json').read_text())
            self.assertEqual(binding['phoneOrigin'], origin)
            self.assertEqual(binding['acceptedPhoneOrigin'], origin + ':10443')
            self.assertEqual(recovery.verify(snapshot)['source']['head'], 'a' * 40)
            with self.assertRaisesRegex(ValueError, 'Unsupported phone origin'):
                recovery.capture(web, destination, release, phone_origin='https://other.example')

    def test_capture_refuses_changed_configuration_without_a_success_manifest(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root).resolve()
            release, web, config, source = self.release_fixture(root)
            destination = root / 'backups'
            destination.mkdir(mode=0o700)
            settings = iter([b'fixture=before', b'fixture=after'])
            def native(args, _config, directory):
                if args[0] == 'export':
                    with zipfile.ZipFile(directory / 'snapshot.zip', 'w') as archive:
                        archive.writestr('_components/betterAuth/user/documents.jsonl', '{"_id":"fixture"}\n')
                    return b''
                return next(settings)
            with patch.object(recovery, 'run', return_value=source), \
                    patch.object(recovery, 'source_config', return_value=(web, config)), \
                    patch.object(recovery, 'check_serving'), patch.object(recovery, 'native', side_effect=native), \
                    self.assertRaisesRegex(ValueError, 'configuration changed during capture'):
                recovery.capture(web, destination, release)
            snapshots = list(destination.glob('snapshot-*'))
            self.assertEqual(len(snapshots), 1)
            self.assertFalse((snapshots[0] / 'manifest.json').exists())
            self.assertEqual((snapshots[0] / 'configuration.env').read_bytes(), b'fixture=before')

    def test_port_probe_refuses_occupied_and_indeterminate_results(self):
        for result, message in [(0, 'already occupied'), (errno.EPERM, 'Cannot determine'),
                                (errno.ETIMEDOUT, 'Cannot determine')]:
            probe = MagicMock()
            probe.__enter__.return_value.connect_ex.return_value = result
            with patch.object(recovery.socket, 'socket', return_value=probe), self.assertRaisesRegex(ValueError, message):
                recovery.require_free_recovery_ports()
        probe = MagicMock()
        probe.__enter__.return_value.connect_ex.return_value = errno.ECONNREFUSED
        with patch.object(recovery.socket, 'socket', return_value=probe):
            recovery.require_free_recovery_ports()
        self.assertEqual(probe.__enter__.return_value.connect_ex.call_count, 2)

    def test_recent_guidance_accounts_are_sampled_independently_of_richest_controls(self):
        candidates = [(0, f'user-{i}', f'principal-{i}', 'home', [], [], []) for i in range(5)]
        preferences = [{'householdId': 'home', 'principalKey': 'principal-0', 'textileId': None,
                        'enabled': False, 'resetAt': 20, 'revision': 2}]
        guidance = [{'_id': f'guidance-{i}', 'householdId': 'home', 'principalKey': f'principal-{i}',
                     'savedAt': i, 'personalInput': {'textileIds': ['shirt']}} for i in range(5)]
        entries = [{'guidanceId': row['_id'], 'textileId': 'shirt'} for row in guidance]
        selected = recovery.private_check_candidates(candidates, preferences, guidance, entries)
        self.assertEqual([candidate[1] for candidate, _ in selected], ['user-0', 'user-4', 'user-3', 'user-2'])
        self.assertEqual(selected[0][1]['preferences'][0]['expected']['scope']['revision'], 2)
        self.assertTrue(all(checks['guidance'][0]['principalKey'] == candidate[2] for candidate, checks in selected))
        with self.assertRaisesRegex(ValueError, 'authorized restored application sample'):
            recovery.private_check_candidates(candidates[1:], preferences, guidance, entries)
        with self.assertRaisesRegex(ValueError, 'authorized restored application sample'):
            recovery.private_check_candidates(candidates[:1], [], guidance[1:], entries)

    def test_restore_accepts_only_reviewed_empty_tables_and_preserves_registry_rows(self):
        with tempfile.TemporaryDirectory() as root:
            source, target = Path(root) / 'source.zip', Path(root) / 'target.zip'
            original_registry = [{'id': 1, 'name': 'textiles'}]
            original_rows = [{'_id': 'shirt', 'name': 'Recorded shirt'}]
            def write(path, registry, clothes=original_rows, addition_rows=(), addition='catalogProducts'):
                with zipfile.ZipFile(path, 'w') as archive:
                    for name, rows in [('_tables', registry), ('textiles', clothes), (addition, addition_rows)]:
                        if name == addition and path == source:
                            continue
                        archive.writestr(name + '/documents.jsonl', ''.join(json.dumps(row) + '\n' for row in rows))
                    archive.writestr('_storage/file', b'captured file')
            write(source, original_registry)
            extended_registry = original_registry + [{'id': 2, 'name': 'catalogProducts'}]
            write(target, extended_registry)
            comparison = recovery.restored_content(source, target, ['catalogProducts'])
            self.assertEqual(comparison['addedEmptyTables'], ['catalogProducts'])
            self.assertTrue(comparison['capturedRowsAndFilesMatched'])
            with self.assertRaises(ValueError):
                recovery.restored_content(source, target)
            write(target, extended_registry, addition_rows=[{'_id': 'uncaptured'}])
            with self.assertRaisesRegex(ValueError, 'uncaptured rows'):
                recovery.restored_content(source, target, ['catalogProducts'])
            write(target, extended_registry, clothes=[{'_id': 'shirt', 'name': 'Changed'}])
            with self.assertRaisesRegex(ValueError, 'captured rows differ'):
                recovery.restored_content(source, target, ['catalogProducts'])
            write(target, [{'id': 9, 'name': 'textiles'}, extended_registry[-1]])
            with self.assertRaisesRegex(ValueError, 'registry differs'):
                recovery.restored_content(source, target, ['catalogProducts'])
            write(target, original_registry + [{'id': 1, 'name': 'catalogProducts'}])
            with self.assertRaisesRegex(ValueError, 'registry ID'):
                recovery.restored_content(source, target, ['catalogProducts'])
            write(target, original_registry + [{'id': 2, 'name': 'unreviewed'}], addition='unreviewed')
            with self.assertRaises(ValueError):
                recovery.restored_content(source, target, ['catalogProducts'])

    def test_private_controls_keep_scope_revision_and_effective_global_cutoff(self):
        rows = [
            {'householdId': 'home', 'principalKey': 'owner', 'textileId': None, 'enabled': False, 'resetAt': 10, 'revision': 2},
            {'householdId': 'home', 'principalKey': 'owner', 'textileId': 'shirt', 'enabled': True, 'resetAt': 5, 'revision': 1},
            {'householdId': 'home', 'principalKey': 'other', 'textileId': 'shirt', 'enabled': True, 'resetAt': 0, 'revision': 0},
            {'householdId': 'elsewhere', 'principalKey': 'owner', 'textileId': None, 'enabled': True, 'resetAt': 20, 'revision': 3},
        ]
        checks = recovery.personal_checks('owner', 'home', rows, [], [])
        self.assertEqual(checks, {'preferences': [
            {'textileId': None, 'expected': {'scope': {'enabled': False, 'resetAt': 10, 'revision': 2}, 'effective': {'enabled': False, 'resetAt': 10}}},
            {'textileId': 'shirt', 'expected': {'scope': {'enabled': True, 'resetAt': 5, 'revision': 1}, 'effective': {'enabled': False, 'resetAt': 10}}},
        ], 'guidance': []})

    def test_private_guidance_requires_exact_references_and_uses_bounded_own_rows(self):
        row = {'_id': 'guidance', 'householdId': 'home', 'principalKey': 'owner', 'savedAt': 0, 'personalInput': {'textileIds': ['shirt', 'towel']}}
        references = [{'guidanceId': 'guidance', 'textileId': textile} for textile in ['towel', 'shirt']]
        self.assertEqual(recovery.personal_checks('owner', 'home', [], [row], references)['guidance'], [row])
        self.assertEqual(recovery.personal_checks('other', 'home', [], [row], [])['guidance'], [])
        for invalid in [references[:1], [references[0], references[0]], references + [references[0]]]:
            with self.assertRaisesRegex(ValueError, 'references differ'):
                recovery.personal_checks('owner', 'home', [], [row], invalid)
        many = [{**row, '_id': str(index), 'savedAt': index, 'personalInput': {'textileIds': ['shirt']}} for index in range(5)]
        refs = [{'guidanceId': row['_id'], 'textileId': 'shirt'} for row in many]
        preferences = [{'householdId': 'home', 'principalKey': 'owner', 'textileId': str(index),
                        'enabled': True, 'resetAt': 0, 'revision': 0} for index in range(6)]
        bounded = recovery.personal_checks('owner', 'home', preferences, many, refs)
        self.assertEqual(len(bounded['guidance']), 2)
        self.assertEqual([row['_id'] for row in bounded['guidance']], ['4', '3'])
        self.assertEqual(len(bounded['preferences']), 3)

    def test_restore_refuses_active_or_ambiguous_targets(self):
        for name, ports in [('anonymous-agent', {'cloud': 3220, 'site': 3221}),
                            ('washcloset-restore-test', {'cloud': 3220, 'site': 3231}),
                            ('unknown', {'cloud': 3230, 'site': 3231})]:
            with self.assertRaises(ValueError):
                recovery.target_config({'deploymentName': name, 'ports': ports})

    def test_private_storage_refuses_repository_and_links(self):
        with self.assertRaises(ValueError):
            recovery.private_root(recovery.REPO)
        with tempfile.TemporaryDirectory() as root:
            link = Path(root) / 'linked'
            link.symlink_to(root)
            with self.assertRaises(ValueError):
                recovery.private_root(link)

    def test_verify_detects_file_tampering_and_components(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            with zipfile.ZipFile(path / 'snapshot.zip', 'w') as archive:
                archive.writestr('textiles/documents.jsonl', '{"_id":"one"}\n')
                archive.writestr('_components/betterAuth/user/documents.jsonl', '{"_id":"user"}\n')
                archive.writestr('_storage/file', b'synthetic')
            (path / 'snapshot.zip').chmod(0o600)
            for name in ['source.tar', 'configuration.env']:
                recovery.private_write(path / name, b'fixture')
            manifest = {'format': 'washcloset-trial-recovery/v1', 'coverage': recovery.inventory(path / 'snapshot.zip'),
                        'sha256': {name: recovery.digest((path / name).read_bytes()) for name in ['snapshot.zip', 'source.tar', 'configuration.env']}}
            recovery.private_write(path / 'manifest.json', json.dumps(manifest).encode())
            recovery.private_write(path / 'manifest.sha256', recovery.digest((path / 'manifest.json').read_bytes()).encode())
            self.assertEqual(recovery.verify(path), manifest)
            self.assertEqual(manifest['coverage']['tables']['_components/betterAuth/user']['count'], 1)
            self.assertEqual(len(manifest['coverage']['files']), 1)
            (path / 'snapshot.zip').write_bytes(b'tampered')
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                recovery.verify(path)


if __name__ == '__main__':
    unittest.main()
