"use strict";

/**
 * @typedef {import("../../document").Doc} Doc
 */

const assert = require("assert");
const { isNonEmptyArray } = require("../../common/util.js");
const {
  builders: { indent, join, line, softline },
  utils: { replaceTextEndOfLine },
} = require("../../document/index.js");
const { locStart, locEnd } = require("../loc.js");
const {
  isTextLikeNode,
  getLastDescendant,
  isPreLikeNode,
  hasPrettierIgnore,
  shouldPreserveContent,
  // [prettierx] support --html-void-tags option:
  isHtmlVoidTagNeeded,
} = require("../utils.js");

function printClosingTag(node, options) {
  return [
	  // XXX - XXX TBD ???
    node.isSelfClosing //&& !isHtmlVoidTagNeeded(node, options)
    ? "" : printClosingTagStart(node, options),
    printClosingTagEnd(node, options),
  ];
}

function printClosingTagStart(node, options) {
  return node.lastChild &&
    needsToBorrowParentClosingTagStartMarker(node.lastChild)
    ? ""
    : [
        printClosingTagPrefix(node, options),
        printClosingTagStartMarker(node, options),
      ];
}

function printClosingTagEnd(node, options) {
  return (
    node.next
      ? needsToBorrowPrevClosingTagEndMarker(node.next)
      : needsToBorrowLastChildClosingTagEndMarker(node.parent)
  )
    ? ""
    : [
        printClosingTagEndMarker(node, options),
        printClosingTagSuffix(node, options),
      ];
}

function printClosingTagPrefix(node, options) {
  return needsToBorrowLastChildClosingTagEndMarker(node)
    ? printClosingTagEndMarker(node.lastChild, options)
    : "";
}

function printClosingTagSuffix(node, options) {
  return needsToBorrowParentClosingTagStartMarker(node)
    ? printClosingTagStartMarker(node.parent, options)
    : needsToBorrowNextOpeningTagStartMarker(node)
    ? printOpeningTagStartMarker(node.next)
    : "";
}

function printClosingTagStartMarker(node, options) {
  assert(!node.isSelfClosing);
  /* istanbul ignore next */
  if (shouldNotPrintClosingTag(node, options)) {
    return "";
  }
  switch (node.type) {
    case "ieConditionalComment":
      return "<!";
    case "element":
      if (node.hasHtmComponentClosingTag) {
        return "<//";
      }
    // fall through
    default:
      return `</${node.rawName}`;
  }
}

function printClosingTagEndMarker(node, options) {
  if (shouldNotPrintClosingTag(node, options)) {
    return "";
  }
  switch (node.type) {
    case "ieConditionalComment":
    case "ieConditionalEndComment":
      return "[endif]-->";
    case "ieConditionalStartComment":
      return "]><!-->";
    case "interpolation":
      return "}}";
    case "element":
      if (node.isSelfClosing) {
        // return "/>";
        // [prettierx] support --html-void-tags option:
        return isHtmlVoidTagNeeded(node, options) ? ">" : "/>";
      }
    // fall through
    default:
      return ">";
  }
}

function shouldNotPrintClosingTag(node, options) {
  return (
    !node.isSelfClosing &&
    !node.endSourceSpan &&
    (hasPrettierIgnore(node) || shouldPreserveContent(node.parent, options))
  );
}

function needsToBorrowPrevClosingTagEndMarker(node) {
  /**
   *     <p></p
   *     >123
   *     ^
   *
   *     <p></p
   *     ><a
   *     ^
   */
  return (
    node.prev &&
    node.prev.type !== "docType" &&
    !isTextLikeNode(node.prev) &&
    node.isLeadingSpaceSensitive &&
    !node.hasLeadingSpaces
  );
}

function needsToBorrowLastChildClosingTagEndMarker(node) {
  /**
   *     <p
   *       ><a></a
   *       ></p
   *       ^
   *     >
   */
  return (
    node.lastChild &&
    node.lastChild.isTrailingSpaceSensitive &&
    !node.lastChild.hasTrailingSpaces &&
    !isTextLikeNode(getLastDescendant(node.lastChild)) &&
    !isPreLikeNode(node)
  );
}

function needsToBorrowParentClosingTagStartMarker(node) {
  /**
   *     <p>
   *       123</p
   *          ^^^
   *     >
   *
   *         123</b
   *       ></a
   *        ^^^
   *     >
   */
  return (
    !node.next &&
    !node.hasTrailingSpaces &&
    node.isTrailingSpaceSensitive &&
    isTextLikeNode(getLastDescendant(node))
  );
}

function needsToBorrowNextOpeningTagStartMarker(node) {
  /**
   *     123<p
   *        ^^
   *     >
   */
  return (
    node.next &&
    !isTextLikeNode(node.next) &&
    isTextLikeNode(node) &&
    node.isTrailingSpaceSensitive &&
    !node.hasTrailingSpaces
  );
}

function getPrettierIgnoreAttributeCommentData(value) {
  const match = value.trim().match(/^prettier-ignore-attribute(?:\s+(.+))?$/s);

  if (!match) {
    return false;
  }

  if (!match[1]) {
    return true;
  }

  return match[1].split(/\s+/);
}

function needsToBorrowParentOpeningTagEndMarker(node) {
  /**
   *     <p
   *       >123
   *       ^
   *
   *     <p
   *       ><a
   *       ^
   */
  return !node.prev && node.isLeadingSpaceSensitive && !node.hasLeadingSpaces;
}

function printAttributes(path, options, print) {
  const node = path.getValue();

  if (!isNonEmptyArray(node.attrs)) {
	  // XXX XXX
    //return node.isSelfClosing
    // [prettierx merge update from prettier@2.3.2] --html-void-tags option:
    return node.isSelfClosing && !isHtmlVoidTagNeeded(node, options)
      ? /**
         *     <br />
         *        ^
         */
        " "
      : "";
  }

  const ignoreAttributeData =
    node.prev &&
    node.prev.type === "comment" &&
    getPrettierIgnoreAttributeCommentData(node.prev.value);

  const hasPrettierIgnoreAttribute =
    typeof ignoreAttributeData === "boolean"
      ? () => ignoreAttributeData
      : Array.isArray(ignoreAttributeData)
      ? (attribute) => ignoreAttributeData.includes(attribute.rawName)
      : () => false;

  const printedAttributes = path.map((attributePath) => {
    const attribute = attributePath.getValue();
    return hasPrettierIgnoreAttribute(attribute)
      ? replaceTextEndOfLine(
          options.originalText.slice(locStart(attribute), locEnd(attribute))
        )
      : print();
  }, "attrs");

  const forceNotToBreakAttrContent =
    node.type === "element" &&
    node.fullName === "script" &&
    node.attrs.length === 1 &&
    node.attrs[0].fullName === "src" &&
    node.children.length === 0;

  /** @type {Doc[]} */
  const parts = [
    indent([
      forceNotToBreakAttrContent ? " " : line,
      join(line, printedAttributes),
    ]),
  ];

  if (
    /**
     *     123<a
     *       attr
     *           ~
     *       >456
     */
    (node.firstChild &&
      needsToBorrowParentOpeningTagEndMarker(node.firstChild)) ||
    /**
     *     <span
     *       >123<meta
     *                ~
     *     /></span>
     */
    (node.isSelfClosing &&
      needsToBorrowLastChildClosingTagEndMarker(node.parent)) ||
    forceNotToBreakAttrContent
  ) {
	  //XXX
    //parts.push(node.isSelfClosing ? " " : "");
    // [prettierx merge update from prettier@2.3.2] --html-void-tags option:
    parts.push(
      node.isSelfClosing && !isHtmlVoidTagNeeded(node, options) ? " " : ""
    )
  } else {
    parts.push(
      options.bracketSameLine
        ? node.isSelfClosing && !isHtmlVoidTagNeeded(node, options) ? " " : ""
        //? node.isSelfClosing
        //  ? " "
        //  : ""
        //: node.isSelfClosing
        : node.isSelfClosing && !isHtmlVoidTagNeeded(node, options)
        ? line
        : softline
    );
  }

  return parts;
}

function printOpeningTagEnd(node) {
  return node.firstChild &&
    needsToBorrowParentOpeningTagEndMarker(node.firstChild)
    ? ""
    : printOpeningTagEndMarker(node);
}

function printOpeningTag(path, options, print) {
  const node = path.getValue();

  return [
    printOpeningTagStart(node, options),
    printAttributes(path, options, print),
	  // XXX TBD ???
    node.isSelfClosing ? "" : printOpeningTagEnd(node),
  ];
}

function printOpeningTagStart(node, options) {
  return node.prev && needsToBorrowNextOpeningTagStartMarker(node.prev)
    ? ""
    : [printOpeningTagPrefix(node, options), printOpeningTagStartMarker(node)];
}

function printOpeningTagPrefix(node, options) {
  return needsToBorrowParentOpeningTagEndMarker(node)
    ? printOpeningTagEndMarker(node.parent)
    : needsToBorrowPrevClosingTagEndMarker(node)
    ? printClosingTagEndMarker(node.prev, options)
    : "";
}

function printOpeningTagStartMarker(node) {
  switch (node.type) {
    case "ieConditionalComment":
    case "ieConditionalStartComment":
      return `<!--[if ${node.condition}`;
    case "ieConditionalEndComment":
      return "<!--<!";
    case "interpolation":
      return "{{";
    case "docType":
      return "<!DOCTYPE";
    case "element":
      if (node.condition) {
        return `<!--[if ${node.condition}]><!--><${node.rawName}`;
      }
    // fall through
    default:
      return `<${node.rawName}`;
  }
}

function printOpeningTagEndMarker(node) {
	// XXX TBD ???
  assert(!node.isSelfClosing);
  switch (node.type) {
    case "ieConditionalComment":
      return "]>";
    case "element":
      if (node.condition) {
        return "><!--<![endif]-->";
      }
    // fall through
    default:
      return ">";
  }
}

module.exports = {
  printClosingTag,
  printClosingTagStart,
  printClosingTagStartMarker,
  printClosingTagEndMarker,
  printClosingTagSuffix,
  printClosingTagEnd,
  needsToBorrowLastChildClosingTagEndMarker,
  needsToBorrowParentClosingTagStartMarker,
  needsToBorrowPrevClosingTagEndMarker,
  printOpeningTag,
  printOpeningTagStart,
  printOpeningTagPrefix,
  printOpeningTagStartMarker,
  printOpeningTagEndMarker,
  needsToBorrowNextOpeningTagStartMarker,
  needsToBorrowParentOpeningTagEndMarker,
};
