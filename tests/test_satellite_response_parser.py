import unittest

from scripts.extract_satellite_field_metrics import parse_statistics_interval, validate_database_write_target


def band(mean):
    return {"stats": {"mean": mean, "min": mean - 0.1, "max": mean + 0.1}}


class Sentinel1ResponseMappingTests(unittest.TestCase):
    def test_b0_to_b3_map_to_named_radar_features(self):
        interval = {"outputs": {
            "backscatter": {"bands": {
                "B0": band(-12.0), "B1": band(-19.0),
                "B2": band(7.0), "B3": band(0.63),
            }},
            "dataMask": {"bands": {"B0": band(0.8)}},
        }}
        raw_bands, stats, valid_pct, indices = parse_statistics_interval("sentinel-1-grd", interval)
        self.assertEqual(list(stats), ["VV", "VH", "VV_MINUS_VH", "VV_VH_RATIO"])
        self.assertEqual(stats["VV"]["mean"], -12.0)
        self.assertEqual(stats["VH"]["mean"], -19.0)
        self.assertEqual(stats["VV_MINUS_VH"]["mean"], 7.0)
        self.assertEqual(stats["VV_VH_RATIO"]["mean"], 0.63)
        self.assertEqual(valid_pct, 80.0)
        self.assertEqual(indices, {})
        self.assertIn("B3", raw_bands)

    def test_missing_band_is_not_fabricated(self):
        interval = {"outputs": {"backscatter": {"bands": {"B0": band(-12.0)}}}}
        _, stats, valid_pct, _ = parse_statistics_interval("sentinel-1-grd", interval)
        self.assertEqual(stats, {"VV": band(-12.0)["stats"]})
        self.assertIsNone(valid_pct)

    def test_sentinel2_named_indices_are_extracted(self):
        interval = {"outputs": {
            "default": {"bands": {
                "B10": band(0.4), "B11": band(0.2), "B12": band(0.3),
                "B13": band(0.1), "B14": band(0.5), "B15": band(0.6),
            }},
            "dataMask": {"bands": {"0": band(0.95)}},
        }}
        _, stats, valid_pct, indices = parse_statistics_interval("sentinel-2-l2a", interval)
        self.assertEqual(stats["NDVI"]["mean"], 0.4)
        self.assertEqual(stats["NDRE"]["mean"], 0.2)
        self.assertEqual(stats["NDMI"]["mean"], 0.3)
        self.assertEqual(stats["NDWI"]["mean"], 0.1)
        self.assertEqual(stats["EVI"]["mean"], 0.5)
        self.assertEqual(stats["SAVI"]["mean"], 0.6)
        self.assertEqual(set(indices), {"NDVI", "NDRE", "NDMI", "NDWI", "EVI", "SAVI"})
        self.assertEqual(valid_pct, 95.0)


if __name__ == "__main__":
    unittest.main()


from scripts.extract_satellite_field_metrics import classify_empty_statistics


class EmptyStatisticsClassificationTests(unittest.TestCase):
    def test_no_intervals_without_catalogue_verification_is_failure(self):
        self.assertEqual(
            classify_empty_statistics(False, []),
            ("failed", "UnverifiedNoObservation", "Statistical API returned no intervals and catalogue absence was not verified."),
        )

    def test_catalogue_products_without_statistics_is_failure(self):
        status, code, message = classify_empty_statistics(True, ["scene-1"])
        self.assertEqual(status, "failed")
        self.assertEqual(code, "CatalogStatisticsMismatch")
        self.assertIn("Catalogue returned products", message)

    def test_verified_zero_catalogue_products_is_no_observation(self):
        self.assertEqual(classify_empty_statistics(True, []), ("no_observation", None, None))


class DatabaseWriteSafetyGateTests(unittest.TestCase):
    def test_writes_disabled_by_default(self):
        ok, reason = validate_database_write_target("https://pilot123.supabase.co", "false", "pilot123")
        self.assertFalse(ok)
        self.assertIn("disabled", reason)

    def test_matching_explicit_pilot_target_is_allowed(self):
        self.assertEqual(validate_database_write_target("https://pilot123.supabase.co", "true", "pilot123"), (True, None))

    def test_mismatched_project_is_blocked(self):
        ok, reason = validate_database_write_target("https://production999.supabase.co", "true", "pilot123")
        self.assertFalse(ok)
        self.assertIn("does not match", reason)

    def test_custom_domain_is_blocked(self):
        ok, _ = validate_database_write_target("https://supabase.example.com", "true", "pilot123")
        self.assertFalse(ok)