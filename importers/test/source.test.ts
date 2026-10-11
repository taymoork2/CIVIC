import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  jsDestructuredDefault,
  jsTokenReferences,
  kotlinEnumCases,
  kotlinFunctionParameters,
  kotlinStyleArms,
  swiftEnumCases,
  swiftPropertyDefault,
  swiftPublicMembers,
  swiftStyleArms,
  tsPropUnion,
  tsTypeKeys,
} from '../src/source.ts'

test('reads Swift enum cases and marks deprecated ones', () => {
  const swift = `public enum ButtonStyle: Int, CaseIterable {
    public static var allCases: [ButtonStyle] = [accent]
    /// Brand fill.
    case accent
    @available(*, deprecated, message: "Use outlineAccent.")
    case outline
    case outlineAccent, subtle
    public var isFloating: Bool { false }
}`
  assert.deepEqual(swiftEnumCases(swift, 'ButtonStyle'), [
    { name: 'accent', deprecated: false },
    { name: 'outline', deprecated: true },
    { name: 'outlineAccent', deprecated: false },
    { name: 'subtle', deprecated: false },
  ])
  assert.throws(() => swiftEnumCases(swift, 'ButtonSize'), /Could not find Swift enum ButtonSize/)
})

test('reads Swift defaults, public members and token-set arms', () => {
  const swift = `open class Button {
    @objc open var style: ButtonStyle = .outlineAccent
    lazy public var tokenSet: ButtonTokenSet = .init()
    public func update() {}
    private var hidden = 1
}
        super.init { token, theme in
            switch token {
            case .backgroundColor:
                return .uiColor {
                    switch style() {
                    case .accent, .floatingAccent:
                        return theme.color(.brandBackground1)
                    case .subtle:
                        return .clear
                    }
                }
            case .borderColor:
                return theme.color(.stroke1)
            }
        }`
  assert.equal(swiftPropertyDefault(swift, 'style'), 'outlineAccent')
  assert.deepEqual(swiftPublicMembers(swift), ['style', 'tokenSet', 'update'])
  assert.deepEqual(swiftStyleArms(swift, 'backgroundColor'), [
    { cases: ['accent', 'floatingAccent'], tokens: ['brandBackground1'] },
    { cases: ['subtle'], tokens: [] },
  ])
})

test('reads Kotlin enums, function parameters with lambdas, and when arms', () => {
  const kotlin = `enum class ButtonStyle {
    Button,
    OutlinedButton,
    TextButton
}
@Composable
fun Button(
    onClick: () -> Unit,
    style: ButtonStyle = ButtonStyle.Button,
    interactionSource: MutableInteractionSource = remember { MutableInteractionSource() },
    buttonTokens: ButtonTokens? = null
) { }
open class ButtonTokens {
    @Composable
    open fun backgroundBrush(buttonInfo: ButtonInfo): StateBrush {
        return when (buttonInfo.style) {
            ButtonStyle.Button -> StateBrush(rest = aliasTokens.brandBackgroundColor[FluentAliasTokens.BrandBackgroundColorTokens.BrandBackground1].value())
            ButtonStyle.OutlinedButton, ButtonStyle.TextButton -> StateBrush()
        }
    }
}`
  assert.deepEqual(kotlinEnumCases(kotlin, 'ButtonStyle').map((entry) => entry.name), ['Button', 'OutlinedButton', 'TextButton'])
  assert.deepEqual(kotlinFunctionParameters(kotlin, 'Button'), [
    { name: 'onClick', type: '() -> Unit' },
    { name: 'style', type: 'ButtonStyle', default: 'ButtonStyle.Button' },
    { name: 'interactionSource', type: 'MutableInteractionSource', default: 'remember { MutableInteractionSource() }' },
    { name: 'buttonTokens', type: 'ButtonTokens?', default: 'null' },
  ])
  assert.deepEqual(kotlinStyleArms(kotlin, 'backgroundBrush', 'ButtonStyle'), [
    { cases: ['Button'], tokens: ['BrandBackground1'] },
    { cases: ['OutlinedButton', 'TextButton'], tokens: [] },
  ])
})

test('reads a TypeScript prop union, type keys, a JS default and token references', () => {
  const dts = `export declare type ButtonProps = ComponentProps<ButtonSlots> & {
    /**
     * size?: not a real key, it sits in a comment
     */
    appearance?: 'secondary' | 'primary' | 'outline';
    shape?: 'rounded' | 'circular';
};
export declare type ButtonSlots = {
    root: NonNullable<Slot<'button'>>;
    icon?: Slot<'span'>;
};`
  assert.deepEqual(tsPropUnion(dts, 'ButtonProps', 'appearance'), ['secondary', 'primary', 'outline'])
  assert.deepEqual(tsTypeKeys(dts, 'ButtonProps'), ['appearance', 'shape'])
  assert.deepEqual(tsTypeKeys(dts, 'ButtonSlots'), ['icon', 'root'])
  assert.throws(() => tsPropUnion(dts, 'ButtonProps', 'size'), /string union for ButtonProps.size/)
  assert.equal(jsDestructuredDefault(`const { appearance = 'secondary', shape = 'rounded' } = props;`, 'appearance'), 'secondary')
  assert.deepEqual(jsTokenReferences('a: tokens.colorB, b: tokens.colorA, c: tokens.colorB'), ['colorA', 'colorB'])
})
