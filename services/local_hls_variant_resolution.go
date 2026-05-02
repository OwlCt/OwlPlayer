package services

type localHLSVariantResolution struct {
	requestedQuality   string
	requestedVariant   hlsVariant
	actualVariant      hlsVariant
	sourceQualityClass localSourceQualityClass
	isDowngraded       bool
	fallbackReason     string
}

const (
	localHLSFallbackReasonSourceLossy   = "source_lossy"
	localHLSFallbackReasonSourceUnknown = "source_unknown"
)

func resolveLocalHLSVariant(
	requestedVariant hlsVariant,
	sourceQualityClass localSourceQualityClass,
	sourceBitrate int,
) localHLSVariantResolution {
	result := localHLSVariantResolution{
		requestedQuality:   requestedVariant.key,
		requestedVariant:   requestedVariant,
		actualVariant:      requestedVariant,
		sourceQualityClass: sourceQualityClass,
	}

	if requestedVariant.key != hlsVariantLossless.key {
		return result
	}

	switch sourceQualityClass {
	case localSourceQualityLossless:
		return result
	case localSourceQualityLossy:
		result.actualVariant = resolveLossyFallbackHLSVariant(sourceBitrate)
		result.isDowngraded = true
		result.fallbackReason = localHLSFallbackReasonSourceLossy
	default:
		result.actualVariant = resolveLossyFallbackHLSVariant(sourceBitrate)
		result.isDowngraded = true
		result.fallbackReason = localHLSFallbackReasonSourceUnknown
	}

	return result
}

func resolveLossyFallbackHLSVariant(sourceBitrate int) hlsVariant {
	switch {
	case sourceBitrate >= 320000:
		return hlsVariantAAC320
	case sourceBitrate >= 256000:
		return hlsVariantAAC256
	case sourceBitrate > 0:
		return hlsVariantAAC192
	default:
		return hlsVariantAAC256
	}
}
