const strings = {
	command: {
		undo: '撤销',
		redo: '重做',
		h1: '标题 1',
		h2: '标题 2',
		h3: '标题 3',
		h4: '标题 4',
		link: '链接',
		paragraph: '段落',
		bold: '粗体',
		italic: '斜体',
		underline: '下划线',
		strikethrough: '删除线',
		blockQuote: '引用',
		code: '行内代码',
		codeBlock: '代码块',
		superscript: '上标',
		subscript: '下标',
		alignLeft: '左对齐',
		alignCenter: '居中对齐',
		alignRight: '右对齐',
		alignJustify: '两端对齐',
		bulletList: '无序列表',
		orderedList: '有序列表',
		taskList: '任务列表',
		imagePlaceholder: '图片占位',
		videoPlaceholder: '视频占位',
		audioPlaceholder: '音频占位',
		iframePlaceholder: '内嵌网页占位',
		table: '表格',
		inlineExpression: '行内公式',
		blockExpression: '块级公式',
		horizontalRule: '分隔线',
		mermaidDiagram: 'Mermaid 图表',
		formatGroup: '格式',
		insertGroup: '插入'
	},
	dragHandle: {
		title: '拖拽手柄',
		turnInto: '转换为',
		insertNext: '在下方插入',
		removeFormatting: '清除格式',
		duplicate: '创建副本',
		copy: '复制',
		delete: '删除节点'
	},
	editor: {
		headingPlaceholder: '请输入标题',
		paragraphPlaceholder: '输入内容，按空格唤起 AI，按 / 唤起命令',
		contentErrorTitle: '无法加载内容',
		contentErrorDescription: '此页面的内容可能已损坏。'
	},
	extension: {
		audio: {
			multiplePasteWarningTitle: '无法一次粘贴多个文件！',
			multiplePasteWarningDescription:
				'一次只能粘贴一个文件，仅会粘贴第一个文件。',
			pasteProcessing: '正在处理粘贴的音频',
			pasteError: '无法粘贴音频',
			multipleDropWarningTitle: '无法一次拖入多个文件！',
			multipleDropWarningDescription:
				'一次只能拖入一个文件，仅会拖入第一个文件。',
			dropProcessing: '正在处理拖入的音频',
			dropError: '无法上传音频',
			enterURLPrompt: '请输入音频 URL',
			insertPlaceholder: '插入音频',
			uploadProcessing: '正在上传音频文件',
			openButton: '打开',
			openError: '无法处理音频文件。',
			uploadTab: '上传',
			embedLinkTab: '嵌入链接',
			uploadButton: '上传音频',
			embedLinkButton: '插入',
			embedLinkPlaceholder: '嵌入音频'
		},
		code: {
			copy: '复制',
			copied: '已复制！',
			plainText: '纯文本',
			searchLanguagePlaceholder: '搜索语言...',
			searchLanguageEmpty: '未找到语言。'
		},
		iframe: {
			enterURLPrompt: '请输入 iframe URL',
			insertPlaceholder: '插入 iframe',
			openButton: '打开',
			embedLinkPlaceholder: '嵌入 iframe',
			embedLinkButton: '插入'
		},
		image: {
			enterURLPrompt: '请输入图片 URL',
			insertPlaceholder: '插入图片',
			uploadProcessing: '正在上传图片文件',
			openButton: '打开',
			openError: '无法处理图片文件。',
			uploadTab: '上传',
			embedLinkTab: '嵌入链接',
			uploadButton: '上传图片',
			embedLinkButton: '插入',
			embedLinkPlaceholder: '嵌入图片'
		},
		media: {
			back: '返回',
			resizeLeft: '向左缩放',
			resizeRight: '向右缩放',
			alignLeft: '左对齐',
			alignCenter: '居中对齐',
			alignRight: '右对齐',
			moreOptions: '更多选项',
			caption: '图注',
			captionPlaceholder: '请输入图注',
			duplicate: '创建副本',
			fullscreen: '全屏',
			delete: '删除'
		},
		table: {
			selectCell: '选择单元格',
			selectRow: '选择行',
			addRow: '添加行',
			addRowAfter: '在下方添加行',
			addRowBefore: '在上方添加行',
			deleteRow: '删除行',
			selectColumn: '选择列',
			addColumn: '添加列',
			addColumnAfter: '在右侧添加列',
			addColumnBefore: '在左侧添加列',
			deleteColumn: '删除列'
		},
		video: {
			multiplePasteWarningTitle: '无法一次粘贴多个文件！',
			multiplePasteWarningDescription:
				'一次只能粘贴一个文件，仅会粘贴第一个文件。',
			pasteProcessing: '正在处理粘贴的视频',
			pasteError: '无法处理粘贴的视频',
			multipleDropWarningTitle: '无法一次拖入多个文件！',
			multipleDropWarningDescription:
				'一次只能拖入一个文件，仅会处理第一个文件。',
			dropProcessing: '正在处理拖入的视频',
			dropError: '无法上传视频',
			enterURLPrompt: '请输入视频 URL',
			insertPlaceholder: '插入视频',
			uploadProcessing: '正在上传视频',
			openButton: '打开',
			openError: '无法处理视频文件。',
			uploadTab: '上传',
			embedLinkTab: '嵌入链接',
			uploadButton: '上传视频',
			embedLinkButton: '插入',
			embedLinkPlaceholder: '嵌入视频'
		}
	},
	menu: {
		link: {
			open: '打开链接',
			edit: '编辑链接',
			copy: '复制链接',
			remove: '移除链接',
			save: '保存',
			enterLinkPlaceholder: '输入或粘贴链接',
			enterLinkButton: '设置新链接'
		},
		math: {
			enterExpressionPlaceholder: '输入数学表达式'
		},
		table: {
			headerColumn: '表头列',
			addColumnAfter: '在右侧添加列',
			addColumnBefore: '在左侧添加列',
			moveColumnLeft: '向左移动列',
			moveColumnRight: '向右移动列',
			deleteColumn: '删除此列',
			headerRow: '表头行',
			addRowAfter: '在下方添加行',
			addRowBefore: '在上方添加行',
			moveRowUp: '向上移动行',
			moveRowDown: '向下移动行',
			deleteRow: '删除此行'
		}
	},
	toolbar: {
		alignment: {
			buttonTitle: '对齐',
			dropdownTitle: '对齐方式'
		},
		color: {
			buttonTitle: '快捷颜色',
			textColor: '文字颜色',
			textColors: '文字颜色',
			highlightColor: '高亮颜色',
			highlightColors: '高亮颜色',
			templateCharacter: 'A',
			default: '默认',
			blue: '蓝色',
			red: '红色',
			brown: '棕色',
			green: '绿色',
			gray: '灰色',
			orange: '橙色',
			pink: '粉色',
			purple: '紫色',
			yellow: '黄色'
		},
		font: {
			buttonTitle: '字号',
			dropdownTitle: '字号',
			tiny: '极小',
			smaller: '较小',
			small: '小',
			default: '默认',
			large: '大',
			extraLarge: '特大'
		},
		heading: {
			buttonTitle: '标题'
		},
		link: {
			buttonTitle: '链接',
			insertLinkPlaceholder: '插入链接',
			insertLink: '插入链接'
		},
		list: {
			buttonTitle: '列表',
			dropdownTitle: '列表'
		},
		searchAndReplace: {
			buttonTitle: '查找和替换',
			showMore: '显示更多',
			goBack: '返回',
			searchAndReplace: '查找和替换',
			searchPlaceholder: '搜索...',
			caseSensitive: '区分大小写',
			goToPrevious: '上一个',
			goToNext: '下一个',
			previous: '上一个',
			next: '下一个',
			replacePlaceholder: '替换为...',
			replace: '替换',
			replaceAll: '全部替换'
		}
	}
};

export default strings;