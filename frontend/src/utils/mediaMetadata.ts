import { type FieldProvenance } from '../types';

function getSourceLabel(source?: string | null): string | null {
  switch (source) {
    case 'tag':
      return '标签';
    case 'embedded_art':
      return '内嵌封面';
    case 'directory':
      return '目录';
    case 'filename':
      return '文件名';
    case 'remote':
      return '在线增强';
    case 'manual':
      return '手动';
    case 'scan':
      return '扫描';
    case 'system':
      return '系统';
    default:
      return source ?? null;
  }
}

export function getMetadataSourceLabels(
  ...fieldSourceGroups: Array<Record<string, FieldProvenance> | undefined | null>
): string[] {
  const labels = new Set<string>();

  const getSummaryLabel = (source?: string | null): string | null => {
    switch (source) {
      case 'tag':
      case 'embedded_art':
      case 'directory':
      case 'filename':
      case 'scan':
        return '标签';
      case 'remote':
        return '在线增强';
      case 'manual':
        return '手动';
      case 'system':
        return '系统';
      default:
        return getSourceLabel(source);
    }
  };

  for (const fieldSources of fieldSourceGroups) {
    if (!fieldSources) {
      continue;
    }

    for (const field of Object.values(fieldSources)) {
      const label = getSummaryLabel(field?.source);
      if (label) {
        labels.add(label);
      }
    }
  }

  return Array.from(labels);
}
