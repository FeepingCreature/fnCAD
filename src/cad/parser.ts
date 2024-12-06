/* OpenSCAD-style CAD language parser
 *
 * This parser implements a recursive descent parser for an OpenSCAD-like syntax:
 * - Module declarations: module name(params) { ... }
 * - Module calls: name(args);
 * - Expressions: numbers, identifiers, binary ops
 * - Nested blocks for CSG operations
 */

import { 
  Node, ModuleDeclaration, ModuleCall, Expression, 
  Parameter, Statement, BinaryExpression, NumberLiteral,
  Identifier, SourceLocation, ModuleCallLocation
} from './types';
import { parseError } from './errors';

/* Parser class implementing recursive descent parsing.
 * The parser maintains state about the current position in the token stream
 * and provides helper methods for consuming tokens and building AST nodes.
 */
export class Parser {
  private current = 0;
  private line = 1;
  private column = 1;
  private tokens: Token[] = [];
  private locations: ModuleCallLocation[] = [];
  private callStack: ModuleCallLocation[] = [];

  constructor(private source: string) {
    this.tokenize();
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private beginModuleCall(name: string, nameToken: Token) {
    const call = {
      moduleName: name,
      nameRange: nameToken.location,
      fullRange: { 
        start: nameToken.location.start,
        end: nameToken.location.end // Will be updated when call ends
      },
      paramRange: {
        start: { line: 0, column: 0, offset: 0 }, // Will be updated in parseArguments
        end: { line: 0, column: 0, offset: 0 }
      },
      parameters: [],
      complete: false
    };
    this.callStack.push(call);
  }


  private endModuleCall(endToken: Token) {
    const call = this.callStack.pop();
    if (call) {
      call.fullRange.end = endToken.location.end;
      call.complete = true;
      this.locations.push(call);
    }
  }

  getLocations(): ModuleCallLocation[] {
    console.log('Returning module call locations:', this.locations);
    return this.locations;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.current >= this.tokens.length;
  }

  private check(value: string): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().value === value;
  }

  private match(value: string): boolean {
    if (this.check(value)) {
      this.advance();
      return true;
    }
    return false;
  }

  private expect(value: string, message: string): Token {
    if (this.check(value)) {
      return this.advance();
    }
    // If we're at the end, use the last token's location
    const location = this.isAtEnd() ? this.previous().location : this.peek().location;
    throw parseError(message, location, this.source);
  }

  /* Tokenize the input source into a stream of tokens.
   * Handles:
   * - Whitespace and newlines for line/column tracking
   * - Numbers (including decimals)
   * - Identifiers and keywords
   * - Single-character tokens (operators, braces, etc)
   */
  private tokenize() {
    let current = 0;
    
    while (current < this.source.length) {
      let char = this.source[current];

      // Handle C-style comments
      if (char === '/' && current + 1 < this.source.length) {
        const nextChar = this.source[current + 1];
        
        // Single-line comment
        if (nextChar === '/') {
          while (current < this.source.length && this.source[current] !== '\n') {
            current++;
            this.column++;
          }
          continue;
        }
        
        // Multi-line comment
        if (nextChar === '*') {
          current += 2; // Skip /*
          this.column += 2;
          
          while (current + 1 < this.source.length) {
            if (this.source[current] === '*' && this.source[current + 1] === '/') {
              current += 2; // Skip */
              this.column += 2;
              break;
            }
            
            if (this.source[current] === '\n') {
              this.line++;
              this.column = 1;
            } else {
              this.column++;
            }
            current++;
          }
          continue;
        }
      }

      // Skip whitespace
      if (/\s/.test(char)) {
        if (char === '\n') {
          this.line++;
          this.column = 1;
        } else {
          this.column++;
        }
        current++;
        continue;
      }

      // Numbers
      if (/[0-9]/.test(char)) {
        let value = '';
        const startOffset = current;
        const startColumn = this.column;

        while (/[0-9.]/.test(char)) {
          value += char;
          current++;
          this.column++;
          char = this.source[current];
        }

        this.tokens.push({
          type: 'number',
          value,
          location: {
            start: { line: this.line, column: startColumn, offset: startOffset },
            end: { line: this.line, column: this.column, offset: current }
          }
        });
        continue;
      }

      // Identifiers and keywords
      if (/[a-zA-Z_]/.test(char)) {
        const startColumn = this.column;
        const startOffset = current;
        let value = '';

        while (current < this.source.length && /[a-zA-Z0-9_]/.test(char)) {
          value += char;
          current++;
          this.column++;
          char = this.source[current];
        }

        this.tokens.push({
          type: 'identifier',
          value,
          location: {
            start: { line: this.line, column: startColumn, offset: startOffset },
            end: { line: this.line, column: this.column, offset: current }
          }
        });
        continue;
      }

      // Single character tokens
      const simpleTokens: Record<string, string> = {
        '(': 'paren',
        ')': 'paren',
        '{': 'brace',
        '}': 'brace',
        '[': 'bracket',
        ']': 'bracket',
        ',': 'comma',
        ';': 'semicolon',
        '=': 'equals',
        '+': 'operator',
        '-': 'operator',
        '*': 'operator',
        '/': 'operator'
      };

      if (char in simpleTokens) {
        this.tokens.push({
          type: simpleTokens[char],
          value: char,
          location: {
            start: { line: this.line, column: this.column, offset: current },
            end: { line: this.line, column: this.column + 1, offset: current + 1 }
          }
        });
        current++;
        this.column++;
        continue;
      }

      throw parseError(`Unexpected character: ${char}`, 
        { start: { line: this.line, column: this.column }, 
          end: { line: this.line, column: this.column + 1 } }, 
        this.source);
    }
  }

  /* Main entry point for parsing.
   * Returns an array of top-level nodes (usually module declarations and calls).
   * The nodes are later wrapped in an implicit union() if there are multiple statements.
   */
  parse(): Node[] {
    const nodes: Node[] = [];
    
    // Skip any remaining tokens (whitespace/comments were already handled in tokenizer)
    while (this.current < this.tokens.length) {
      nodes.push(this.parseStatement());
    }

    // Empty input is valid - represents an empty scene
    return nodes;
  }

  private parseStatement(): Node {
    const token = this.tokens[this.current];

    if (token.type === 'identifier') {
      if (token.value === 'module') {
        return this.parseModuleDeclaration();
      }
      return this.parseModuleCall();
    }

    if (token.type === 'semicolon') {
      throw parseError(`Unexpected semicolon`, token.location, this.source);
    }
    throw parseError(`Unexpected token type: ${token.type}`, token.location, this.source);
  }

  private parseModuleDeclaration(): ModuleDeclaration {
    const start = this.peek().location.start;
    this.advance(); // Skip 'module' keyword

    const nameToken = this.peek();
    if (nameToken.type !== 'identifier') {
      throw parseError('Expected module name', nameToken.location, this.source);
    }
    const name = nameToken.value;
    this.advance();

    const parameters = this.parseParameters();
    const body = this.parseBlock();

    return new ModuleDeclaration(
      name,
      parameters,
      body,
      {
        start,
        end: this.previous().location.end
      }
    );
  }

  private parseParameters(): Parameter[] {
    this.expect('(', 'Expected (');
    const parameters: Parameter[] = [];

    while (!this.isAtEnd() && !this.check(')')) {
      const nameToken = this.peek();
      if (nameToken.type !== 'identifier') {
        throw parseError('Expected parameter name', nameToken.location, this.source);
      }
      this.advance();

      let defaultValue: Expression | undefined;
      if (this.match('=')) {
        defaultValue = this.parseExpression();
      }

      parameters.push({
        name: nameToken.value,
        defaultValue
      });

      this.match(','); // Optional comma
    }

    this.expect(')', 'Expected )');
    return parameters;
  }

  private parseBlock(): Statement[] {
    this.expect('{', 'Expected {');
    const statements: Statement[] = [];

    while (!this.isAtEnd() && !this.check('}')) {
      statements.push(this.parseStatement());
    }

    this.expect('}', 'Expected }');
    return statements;
  }

  private parseModuleCall(): ModuleCall {
    const nameToken = this.peek();
    const name = nameToken.value;
    this.beginModuleCall(name, nameToken);
    this.advance();

    const args = this.parseArguments();

    let children: Statement[] | undefined;
    if (this.check('{')) {
      this.peek(); // Consume the opening brace
      children = this.parseBlock();
      this.endModuleCall(this.previous());
    } else {
      const semicolon = this.expect(';', 'Expected semicolon');
      this.endModuleCall(semicolon);
    }

    return new ModuleCall(
      name,
      args,
      children,
      {
        start: nameToken.location.start,
        end: this.previous().location.end
      }
    );
  }

  private parseArguments(): Record<string, Expression> {
    const args: Record<string, Expression> = {};

    // Expect opening paren
    const openParen = this.expect('(', 'Expected (');
    if (this.callStack.length > 0) {
      const currentCall = this.callStack[this.callStack.length - 1];
      currentCall.paramRange.start = {
        line: openParen.location.start.line,
        column: openParen.location.start.column + 1,
        offset: openParen.location.start.offset + 1
      };
    }

    while (this.current < this.tokens.length && this.tokens[this.current].value !== ')') {
      const startToken = this.tokens[this.current];
      let name = '';
      let nameRange: SourceLocation | undefined;
      let value: Expression;
      
      // Check if we have a named argument
      if (this.current + 1 < this.tokens.length && this.tokens[this.current + 1].value === '=') {
        if (startToken.type !== 'identifier') {
          throw parseError(`Expected parameter name`, startToken.location, this.source);
        }
        name = startToken.value;
        nameRange = startToken.location;
        this.current += 2; // Skip name and equals
      }

      const paramStartPos = startToken.location.start;
      value = this.parseExpression();
      const valueEndPos = this.previous().location.end;

      // Add to current module call's parameters if we're tracking one
      if (this.callStack.length > 0) {
        const currentCall = this.callStack[this.callStack.length - 1];
        const paramRange = {
          start: paramStartPos,
          end: valueEndPos
        };
        
        currentCall.parameters.push({
          name: name || String(Object.keys(args).length),
          range: paramRange,
          nameRange,
          value: this.source.substring(
            paramStartPos.offset,
            valueEndPos.offset
          )
        });
      }

      args[name || String(Object.keys(args).length)] = value;

      if (this.tokens[this.current].value === ',') {
        this.current++;
      }
    }

    // Expect closing paren
    const closeParen = this.tokens[this.current];
    if (closeParen.value !== ')') {
      throw parseError('Expected )', closeParen.location, this.source);
    }
    if (this.callStack.length > 0) {
      const currentCall = this.callStack[this.callStack.length - 1];
      // End the param range before the closing parenthesis
      currentCall.paramRange.end = {
        line: closeParen.location.end.line,
        column: closeParen.location.end.column - 1,
        offset: closeParen.location.end.offset - 1
      };
    }
    this.current++;

    return args;
  }

  private parseExpression(): Expression {
    let left = this.parsePrimary();

    while (
      this.current < this.tokens.length && 
      this.tokens[this.current].type === 'operator'
    ) {
      const operator = this.tokens[this.current].value as '+' | '-' | '*' | '/';
      this.current++;

      const right = this.parsePrimary();

      left = new BinaryExpression(
        operator,
        left,
        right,
        {
          start: left.location.start,
          end: right.location.end
        }
      );
    }

    return left;
  }

  private parsePrimary(): Expression {
    const token = this.tokens[this.current];
    this.current++;

    if (token.type === 'number') {
      return new NumberLiteral(
        parseFloat(token.value),
        token.location
      );
    }

    if (token.type === 'identifier') {
      return new Identifier(
        token.value,
        token.location
      );
    }

    throw parseError(`Unexpected token type: ${token.type}`, token.location, this.source);
  }
}

interface Token {
  type: string;
  value: string;
  location: SourceLocation;
}

export function parse(source: string): Node {
  const parser = new Parser(source);
  const statements = parser.parse();
  // Wrap multiple statements in an implicit group
  if (statements.length === 1) {
    return statements[0];
  }
  return new ModuleCall(
    'union',
    {},
    statements,
    {
      start: statements[0]?.location.start || { line: 1, column: 1 },
      end: statements[statements.length - 1]?.location.end || { line: 1, column: 1 }
    }
  );
}
