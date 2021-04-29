- Version 0.9.59+2257: Race condition fixes in master (#687) PR url: git@github.com:nutanix/papiea.git/pull/687
- Version 0.9.58+2247: Fix OOM issue && Use AsyncIterators to fetch intent watchers [#683] PR url: git@github.com:nutanix/papiea.git/pull/683
- Version 0.9.57+2229: Merge pull request #682 from nutanix/josh/larger-request-sizes PR url: git@github.com:nutanix/papiea.git/pull/682
- Version 0.9.56+2222: Modified logic and design for update status operation (#677) PR url: git@github.com:nutanix/papiea.git/pull/677
- Version 0.9.55+2204: Fixed deep copy bug in diff sanitizer and modified input for on_delete handler. (#678) PR url: git@github.com:nutanix/papiea.git/pull/678
- Version 0.9.54+2193: Fix error details swallowing in papiea (#636) PR url: git@github.com:nutanix/papiea.git/pull/636
- Version 0.9.53+2186: bump version
- Version 0.9.51+2141: Shlomi/update css (#662) PR url: git@github.com:nutanix/papiea.git/pull/662
- Version 0.9.50+2130: Added validator check for untyped object not marked as status-only and related test. (#651) PR url: git@github.com:nutanix/papiea.git/pull/651
- Version 0.9.49+2127: Add context to background task (#659) PR url: git@github.com:nutanix/papiea.git/pull/659
- Version 0.9.48+2122: Squash a couple more pretty_prints
- Version 0.9.47+2119: Fix hard-coded pretty-printing (and some trailing whitespace) (#657) PR url: git@github.com:nutanix/papiea.git/pull/657
- Version 0.9.46+2113: hotfix for parallel execution (don't wait in handlers) (#655) PR url: git@github.com:nutanix/papiea.git/pull/655
- Version 0.9.45+2109: Fixed nullable schema bug in python sdk
- Version 0.9.44+2103: fix custom field bugs & added metadata extension adjustment (#653) PR url: git@github.com:nutanix/papiea.git/pull/653
- Version 0.9.43+2097: Fixed undefined properties in schema bug in remove status-only fields module
- Version 0.9.42+2094: Remove nullable fields (#648) PR url: git@github.com:nutanix/papiea.git/pull/648
- Version 0.9.41+2091: Fixed bug in remove status-only fields module to replace schema with status
- Version 0.9.40+2085: Modified logic for the sanitizer functions in sfs compiler (#649) PR url: git@github.com:nutanix/papiea.git/pull/649
- Version 0.9.39+2079: Update upgrade-versions.sh
- Version 0.9.38+2074: Removed dependency on Node env production variable in printing logs. (#647) PR url: git@github.com:nutanix/papiea.git/pull/647
- Version 0.9.36+2060: Background task implementation (#635) PR url: git@github.com:nutanix/papiea.git/pull/635
- Version 0.9.35+2054: Remove undefined and null fields from the differ input entity. (#645) PR url: git@github.com:nutanix/papiea.git/pull/645
- Version 0.9.34+2048: add python sdk installation instructions
- Version 0.9.33+2032: fix directive
- Version 0.9.32+2024: try remove build stage
- Version 0.9.31+2020: Improved logging information for papiea (#623) PR url: git@github.com:nutanix/papiea.git/pull/623
- Version 0.9.30+2013: End-to-end tests for papiea client in typescript sdk (#597) PR url: git@github.com:nutanix/papiea.git/pull/597
- Version 0.9.29+2008: Remove more jaeger debug logs (#632) PR url: git@github.com:nutanix/papiea.git/pull/632
- Version 0.9.28+2002: Added validator and swagger error message translate function in api docs (#629) PR url: git@github.com:nutanix/papiea.git/pull/629
- Version 0.9.27+1994: Jaeger suppress messages config (#631) PR url: git@github.com:nutanix/papiea.git/pull/631
- Version 0.9.26+1985: Add argument validation (#630)
- Version 0.9.25+1974: Fix client tracing issues (#624) PR url: git@github.com:nutanix/papiea.git/pull/624
- Version 0.9.24+1964: Fixed client tests and added sdk tests to verify status-only fields in spec create
- Version 0.9.23+1958: Fixed deep copy bug in validate spec module in validator
- Version 0.9.22+1955: Removed input tag from the constructor procedure schema in api docs (#616) PR url: git@github.com:nutanix/papiea.git/pull/616
- Version 0.9.21+1952: Use kind structure in sdk on_create if input schema is missing (#615) PR url: git@github.com:nutanix/papiea.git/pull/615
- Version 0.9.20+1949: Added strict checking in validate status-only fields module in validator (#617) PR url: git@github.com:nutanix/papiea.git/pull/617
- Version 0.9.19+1942: Modified papiea client to remove input tag from the procedures input
- Version 0.9.18+1933: Removed requirement for input field in the procedures input (#592) PR url: git@github.com:nutanix/papiea.git/pull/592
- Version 0.9.17+1928: fix api docs problem (#614) PR url: git@github.com:nutanix/papiea.git/pull/614
- Version 0.9.16+1924: Reduced diff retry backoff exponent for debugging purposes (#594) PR url: git@github.com:nutanix/papiea.git/pull/594
- Version 0.9.15+1918: Papiea client is dependent on backend-utils, capture it
- Version 0.9.14+1909: Swallowing stacktrace is bad for debugging
- Version 0.9.13+1906: Swallowing stacktrace is bad for debugging
- Version 0.9.12+1893: Introduce tracing to logging of papiea components (#584) PR url: git@github.com:nutanix/papiea.git/pull/584
- Version 0.9.11+1862: Added authorizer for intent watcher related operations (#591) PR url: git@github.com:nutanix/papiea.git/pull/591
- Version 0.9.10+1845: added test and check for the wrong format (#590)
- Version 0.9.9+1835: Added semantic version check for the papiea sdk requests (#573) PR url: git@github.com:nutanix/papiea.git/pull/573
- Version 0.9.8+1831: Logging verbosity (#578) PR url: git@github.com:nutanix/papiea.git/pull/578
- Version 0.9.7+1824: Added validation check to not allow required status-only fields in schema (#569) PR url: git@github.com:nutanix/papiea.git/pull/569
- Version 0.9.6+1821: Bump ini from 1.3.5 to 1.3.7 in /papiea-engine (#568) PR url: git@github.com:nutanix/papiea.git/pull/568
- Version 0.9.5+1818: Bump cryptography from 2.3 to 3.2 in /papiea-sdk/python/e2e_tests (#536) PR url: git@github.com:nutanix/papiea.git/pull/536
- Version 0.9.4+1815: Fixed payload on client to not collide with constructor implementation details (#570)
- Version 0.9.3+1806: Added deprecate info for the replace_status sdk method and relavant tests. (#564) PR url: git@github.com:nutanix/papiea.git/pull/564
- Version 0.9.2+1800: Bump dot-prop from 4.2.0 to 4.2.1 in /papiea-engine (#544) PR url: git@github.com:nutanix/papiea.git/pull/544
- Version 0.9.1+1796: Custom entity constructors implementation (#550)
- Version 0.8.9+1781: Added module to remove status-only fields from entity status (#546) PR url: git@github.com:nutanix/papiea.git/pull/546
- Version 0.8.8+1773: fix version in case commit message is used instead of version (#560)
- Version 0.8.7+1767: added log line for health check failed situation (#558) PR url: git@github.com:nutanix/papiea.git/pull/558
- Version 0.8.6+1763: Separated null value fields and unset in status db (#555) PR url: git@github.com:nutanix/papiea.git/pull/555
- Version 0.8.5+1748: update yarn locks (#552) PR url: git@github.com:nutanix/papiea.git/pull/552
- Version 0.8.4+1735: Changed error message for bad request error in validator (#549) PR url: git@github.com:nutanix/papiea.git/pull/549
- Version 0.8.3+1732: Fix swagger errors in papiea-engine (#548) PR url: git@github.com:nutanix/papiea.git/pull/548
- Version 0.8.2+1727: Fix status not found deletion bug (#547) PR url: git@github.com:nutanix/papiea.git/pull/547
- Version 0.8.1+1711: Randomness in intentful handler (#535) PR url: git@github.com:nutanix/papiea.git/pull/535
  * Breaking changes:
    1. Intentful Status:
        * Removed `Pending` status
        * Removed `Failed` status
    2. Intent Watcher:
        * Removed `times_failed` field
        * Removed `last_handler_error` field
    3. DiffContent (previously referred to as `diff.diff_fields`)
        * Introduced `DiffContent` interface
        * Added `path` field
- Version 0.7.23+1705: Added stacktrace and errors field for validation error type (#543) PR url: git@github.com:nutanix/papiea.git/pull/543
- Version 0.7.22+1697: Fixed nested value of type any in update_status issue and added test for the same. (#542) PR url: git@github.com:nutanix/papiea.git/pull/542
- Version 0.7.21+1682: Optional field nullable issue fix (#539) PR url: git@github.com:nutanix/papiea.git/pull/539
- Version 0.7.20+1657: Bump pyxdg from 0.25 to 0.26 in /papiea-sdk/python/e2e_tests (#524) PR url: git@github.com:nutanix/papiea.git/pull/524
- Version 0.7.19+1653: fix partial array update error (#533) PR url: git@github.com:nutanix/papiea.git/pull/533
- Version 0.7.18+1649: Merge branch 'nitesh/reduce_verbose_logging' of https://github.com/nutanix/papiea into nitesh/reduce_verbose_logging
- Version 0.7.17+1644: Bump cryptography from 2.1.4 to 2.3 in /papiea-sdk/python/e2e_tests (#525) PR url: git@github.com:nutanix/papiea.git/pull/525
- Version 0.7.16+1641: Merge remote-tracking branch 'origin/master'
- Version 0.7.13+1631: fixed validator error connected to optional fields (#529) PR url: git@github.com:nutanix/papiea.git/pull/529
- Version 0.7.12+1613: Add IntentWatcher API (#516) PR url: git@github.com:nutanix/papiea.git/pull/516
- Version 0.7.11+1608: fixed the problem & introduced tests (#522) PR url: git@github.com:nutanix/papiea.git/pull/522
- Version 0.7.10+1592: add new options to customize timeouts (#520)
- Version 0.0.203+1586: build dir to exclude while compiling
- Version 0.0.202+1583: build packages on CI machine
- Version 0.0.201+1580: Merge remote-tracking branch 'origin/igor-fix-incomplete-packages' into igor-fix-incomplete-packages
- Version 0.0.200+1577: adding build to publish artifacts
- Version 0.7.9+1569: Added papiea customization via file config (#510)
- Version 0.7.8+1557: fixed multiple validation problems (#512) PR url: git@github.com:nutanix/papiea.git/pull/512
- Version 0.7.7+1552: Bump bl from 2.2.0 to 2.2.1 in /papiea-engine (#506)
- Version 0.7.6+1545: Exponential backoff implementation (#507)
- Version 0.7.5+1541: Fixed provider not found return error code from 500 to 404 (#509)
- Version 0.7.4+1525: Race condition in diff engine (#481) PR url: git@github.com:nutanix/papiea.git/pull/481
- Version 0.7.3+1505: Bump bl from 2.2.0 to 2.2.1 in /papiea-engine (#496) PR url: git@github.com:nutanix/papiea.git/pull/496
- Version 0.7.2+1499: remove old versions from changelog
- Version 0.7.1+1496: changed release version
- Version : introduce appending changes to CHANGELOG.md when PR is merged to master (#498), manually bump versions (#499)
# Changelog

All notable changes to this project will be documented in this file.
