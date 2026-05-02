package services

import (
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
)

type parsedLRCLines struct {
	lines []lrcLine
}

type lrcLine struct {
	Timestamp int64
	Text      string
}

func detectLocalLyricsFormat(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(trimmed, "<tt") || strings.Contains(trimmed, "<tt ") {
		return "ttml"
	}
	if strings.Contains(trimmed, "[") && strings.Contains(trimmed, "]") {
		return "lrc"
	}
	return "plain"
}

func readLyricsFile(path string) (string, string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", "", err
	}

	content := strings.TrimSpace(string(data))
	if content == "" {
		return "", "", nil
	}

	format := detectLocalLyricsFormat(content)
	if format == "" {
		format = strings.TrimPrefix(strings.ToLower(filepathExt(path)), ".")
	}
	return content, format, nil
}

func normalizeLocalLyricsToTTML(content, format string) (string, string, error) {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return "", "", nil
	}

	switch strings.ToLower(strings.TrimSpace(format)) {
	case "ttml":
		return trimmed, detectTTMLType(trimmed), nil
	case "lrc":
		return lrcToTTML(trimmed)
	case "plain", "":
		return plainLyricsToTTML(trimmed), "lyrics", nil
	default:
		return plainLyricsToTTML(trimmed), "lyrics", nil
	}
}

func detectTTMLType(ttml string) string {
	if strings.Contains(ttml, `itunes:timing="Word"`) || strings.Contains(ttml, `itunes:timing='Word'`) {
		return "syllable-lyrics"
	}
	return "lyrics"
}

func lrcToTTML(content string) (string, string, error) {
	parsed := parseLRC(content)
	if len(parsed.lines) == 0 {
		return plainLyricsToTTML(content), "lyrics", nil
	}

	var builder strings.Builder
	builder.WriteString(`<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Line">`)
	builder.WriteString("<body><div>")
	for index, line := range parsed.lines {
		endTime := line.Timestamp + 5000
		if index+1 < len(parsed.lines) && parsed.lines[index+1].Timestamp > line.Timestamp {
			endTime = parsed.lines[index+1].Timestamp
		}
		builder.WriteString(fmt.Sprintf(
			`<p begin="%s" end="%s" itunes:key="L%d">%s</p>`,
			formatTTMLTime(line.Timestamp),
			formatTTMLTime(endTime),
			index+1,
			escapeXML(line.Text),
		))
	}
	builder.WriteString("</div></body></tt>")
	return builder.String(), "lyrics", nil
}

func parseLRC(content string) parsedLRCLines {
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	result := parsedLRCLines{lines: make([]lrcLine, 0, len(lines))}

	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}

		remaining := line
		timestamps := make([]int64, 0, 2)
		for strings.HasPrefix(remaining, "[") {
			closing := strings.Index(remaining, "]")
			if closing <= 1 {
				break
			}

			value := remaining[1:closing]
			timestamp, ok := parseLRCTimestamp(value)
			if !ok {
				break
			}
			timestamps = append(timestamps, timestamp)
			remaining = strings.TrimSpace(remaining[closing+1:])
		}

		if len(timestamps) == 0 {
			continue
		}

		for _, timestamp := range timestamps {
			result.lines = append(result.lines, lrcLine{
				Timestamp: timestamp,
				Text:      remaining,
			})
		}
	}

	sort.Slice(result.lines, func(i, j int) bool {
		if result.lines[i].Timestamp == result.lines[j].Timestamp {
			return result.lines[i].Text < result.lines[j].Text
		}
		return result.lines[i].Timestamp < result.lines[j].Timestamp
	})
	return result
}

func parseLRCTimestamp(value string) (int64, bool) {
	parts := strings.SplitN(value, ":", 2)
	if len(parts) != 2 {
		return 0, false
	}

	minutes, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil || minutes < 0 {
		return 0, false
	}

	secondsPart := strings.TrimSpace(parts[1])
	seconds := 0
	millis := 0
	if dot := strings.IndexAny(secondsPart, ".,"); dot >= 0 {
		seconds, err = strconv.Atoi(secondsPart[:dot])
		if err != nil || seconds < 0 {
			return 0, false
		}
		fraction := secondsPart[dot+1:]
		switch len(fraction) {
		case 1:
			millis, err = strconv.Atoi(fraction + "00")
		case 2:
			millis, err = strconv.Atoi(fraction + "0")
		default:
			millis, err = strconv.Atoi(fraction[:min(len(fraction), 3)])
		}
		if err != nil || millis < 0 {
			return 0, false
		}
	} else {
		seconds, err = strconv.Atoi(secondsPart)
		if err != nil || seconds < 0 {
			return 0, false
		}
	}

	return int64(minutes*60+seconds)*1000 + int64(millis), true
}

func plainLyricsToTTML(content string) string {
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	filtered := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			filtered = append(filtered, trimmed)
		}
	}

	if len(filtered) == 0 {
		return ""
	}

	var builder strings.Builder
	builder.WriteString(`<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Line">`)
	builder.WriteString("<body><div>")
	for index, line := range filtered {
		startTime := int64(index * 5000)
		endTime := startTime + 5000
		builder.WriteString(fmt.Sprintf(
			`<p begin="%s" end="%s" itunes:key="L%d">%s</p>`,
			formatTTMLTime(startTime),
			formatTTMLTime(endTime),
			index+1,
			escapeXML(line),
		))
	}
	builder.WriteString("</div></body></tt>")
	return builder.String()
}

func formatTTMLTime(value int64) string {
	seconds := value / 1000
	millis := value % 1000
	return fmt.Sprintf("%d.%03d", seconds, millis)
}

func escapeXML(value string) string {
	replacer := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&apos;",
	)
	return replacer.Replace(value)
}

func filepathExt(path string) string {
	index := strings.LastIndex(path, ".")
	if index < 0 {
		return ""
	}
	return path[index:]
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
